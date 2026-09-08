import io
import os
import uuid
from unittest.mock import MagicMock, patch
import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.storage import StorageManager
from backend import config
from db.models import InternalUser, Vendor, VendorUser, Department, JobRole, Resume, RecruiterCompanyAccess
from backend.auth import hash_password


def test_local_storage_lifecycle(tmp_path):
    """
    Test full lifecycle in local filesystem mode: save, exists, get, delete.
    """
    test_storage_dir = str(tmp_path / "local_storage")
    os.makedirs(test_storage_dir, exist_ok=True)

    with patch.dict(os.environ, {"STORAGE_BACKEND": "local", "STORAGE_DIR": test_storage_dir}):
        with patch.object(config, "STORAGE_BACKEND", "local"), patch.object(config, "STORAGE_DIR", test_storage_dir):
            file_id = f"test_{uuid.uuid4().hex[:8]}"
            content = b"Local file storage test binary content"
            filename = "sample_doc.pdf"

            # 1. Save file
            saved_path = StorageManager.save_file(file_id, content, filename, content_type="application/pdf")
            assert os.path.exists(saved_path)
            assert saved_path.endswith(f"{file_id}.pdf")

            # 2. File exists
            assert StorageManager.file_exists(saved_path) is True
            assert StorageManager.file_exists(f"{file_id}.pdf") is True
            assert StorageManager.file_exists("non_existent_file.pdf") is False

            # 3. Get file
            retrieved = StorageManager.get_file(saved_path)
            assert retrieved == content

            # Also get via relative key
            retrieved_rel = StorageManager.get_file(f"{file_id}.pdf")
            assert retrieved_rel == content

            # 4. Delete file
            assert StorageManager.delete_file(saved_path) is True
            assert StorageManager.file_exists(saved_path) is False
            assert os.path.exists(saved_path) is False

            # 5. Get non-existent raises FileNotFoundError
            with pytest.raises(FileNotFoundError):
                StorageManager.get_file(saved_path)


def test_s3_storage_lifecycle_mocked():
    """
    Test full lifecycle in S3/R2 mode using mocked boto3 S3 client.
    Verifies that object keys (not local paths) are generated and returned.
    """
    mock_s3 = MagicMock()
    stored_objects = {}

    def mock_put_object(Bucket, Key, Body, **kwargs):
        stored_objects[Key] = Body
        return {"ETag": "mock-etag"}

    def mock_get_object(Bucket, Key):
        if Key not in stored_objects:
            error_response = {"Error": {"Code": "NoSuchKey", "Message": "The specified key does not exist."}}
            raise ClientError(error_response, "GetObject")
        body_mock = MagicMock()
        body_mock.read.return_value = stored_objects[Key]
        return {"Body": body_mock, "ContentType": "application/pdf"}

    def mock_head_object(Bucket, Key):
        if Key not in stored_objects:
            error_response = {"Error": {"Code": "404", "Message": "Not Found"}}
            raise ClientError(error_response, "HeadObject")
        return {"ContentLength": len(stored_objects[Key])}

    def mock_delete_object(Bucket, Key):
        stored_objects.pop(Key, None)
        return {"DeleteMarker": True}

    mock_s3.put_object.side_effect = mock_put_object
    mock_s3.get_object.side_effect = mock_get_object
    mock_s3.head_object.side_effect = mock_head_object
    mock_s3.delete_object.side_effect = mock_delete_object

    env_overrides = {
        "STORAGE_BACKEND": "s3",
        "S3_ENDPOINT_URL": "https://test-account.r2.cloudflarestorage.com",
        "S3_BUCKET_NAME": "vms-r2-test-bucket",
        "S3_ACCESS_KEY_ID": "mock-access-key",
        "S3_SECRET_ACCESS_KEY": "mock-secret-key",
        "S3_REGION": "auto"
    }

    with patch.dict(os.environ, env_overrides):
        with patch.object(StorageManager, "get_s3_client", return_value=mock_s3):
            file_id = f"r2_test_{uuid.uuid4().hex[:8]}"
            content = b"%PDF-1.4 Mocked Cloudflare R2 binary payload %%EOF"
            filename = "candidate_resume.pdf"

            # 1. Save file -> returns object key, NOT local filesystem path
            object_key = StorageManager.save_file(file_id, content, filename, content_type="application/pdf")
            assert object_key == f"{file_id}.pdf"
            assert not os.path.isabs(object_key)
            assert object_key in stored_objects

            mock_s3.put_object.assert_called_with(
                Bucket="vms-r2-test-bucket",
                Key=f"{file_id}.pdf",
                Body=content,
                ContentType="application/pdf"
            )

            # 2. Check file_exists
            assert StorageManager.file_exists(object_key) is True
            assert StorageManager.file_exists("non_existent_key.pdf") is False

            # 3. Get file
            retrieved_bytes = StorageManager.get_file(object_key)
            assert retrieved_bytes == content

            # 4. Delete file
            assert StorageManager.delete_file(object_key) is True
            assert StorageManager.file_exists(object_key) is False

            # 5. Get file after delete raises FileNotFoundError
            with pytest.raises(FileNotFoundError):
                StorageManager.get_file(object_key)


def test_s3_client_initialization():
    """
    Test that StorageManager.get_s3_client correctly configures endpoint_url, credentials and s3v4 signature.
    """
    env_overrides = {
        "STORAGE_BACKEND": "s3",
        "S3_ENDPOINT_URL": "https://abcdef12345.r2.cloudflarestorage.com",
        "S3_BUCKET_NAME": "vms-production-storage",
        "S3_ACCESS_KEY_ID": "r2-access-key-id",
        "S3_SECRET_ACCESS_KEY": "r2-secret-access-key",
        "S3_REGION": "auto"
    }

    with patch.dict(os.environ, env_overrides):
        with patch("boto3.client") as mock_boto_client:
            StorageManager.get_s3_client()
            mock_boto_client.assert_called_once()
            call_args, call_kwargs = mock_boto_client.call_args
            assert call_args[0] == "s3"
            assert call_kwargs["endpoint_url"] == "https://abcdef12345.r2.cloudflarestorage.com"
            assert call_kwargs["aws_access_key_id"] == "r2-access-key-id"
            assert call_kwargs["aws_secret_access_key"] == "r2-secret-access-key"
            assert call_kwargs["region_name"] == "auto"
            assert call_kwargs["config"].signature_version == "s3v4"


def get_auth_header(client: TestClient, email: str, password: str = "Password123!", is_vendor: bool = False):
    endpoint = "/api/v1/auth/vendor/login" if is_vendor else "/api/v1/auth/recruiter/login"
    resp = client.post(endpoint, json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.json()}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def setup_storage_test_data(db: Session):
    dept = db.query(Department).filter(Department.name == "Storage Test Dept").first()
    if not dept:
        dept = Department(name="Storage Test Dept", status="ACTIVE")
        db.add(dept)
        db.flush()

    recruiter = db.query(InternalUser).filter(InternalUser.email == "recruiter_storage@corp.com").first()
    if not recruiter:
        recruiter = InternalUser(
            email="recruiter_storage@corp.com",
            password_hash=hash_password("Password123!"),
            name="Recruiter Storage",
            mobile="+919876543210",
            role="RECRUITER",
            status="ACTIVE"
        )
        db.add(recruiter)
        db.flush()

    vendor = db.query(Vendor).filter(Vendor.normalized_name == "storage test vendor").first()
    if not vendor:
        vendor = Vendor(name="Storage Test Vendor", normalized_name="storage test vendor", is_tenant=True)
        db.add(vendor)
        db.flush()
    else:
        vendor.is_tenant = True
        db.flush()

    user = db.query(VendorUser).filter(VendorUser.email == "vendor_storage@corp.com").first()
    if not user:
        user = VendorUser(
            vendor_id=vendor.id,
            email="vendor_storage@corp.com",
            password_hash=hash_password("Password123!"),
            name="Vendor Storage User",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db.add(user)
        db.flush()

    acc = db.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id == recruiter.id,
        RecruiterCompanyAccess.company_id == vendor.id
    ).first()
    if not acc:
        db.add(RecruiterCompanyAccess(recruiter_id=recruiter.id, company_id=vendor.id, status="APPROVED"))

    db.commit()
    return dept, recruiter, vendor, user


def test_jd_upload_and_download_e2e_with_mocked_s3(client: TestClient, db_session: Session):
    """
    Test JD upload, view, download, replacement, and deletion through FastAPI routes
    with S3/R2 storage backend mocked.
    """
    dept, recruiter, vendor, user = setup_storage_test_data(db_session)
    rec_headers = get_auth_header(client, "recruiter_storage@corp.com")
    vendor_headers = get_auth_header(client, "vendor_storage@corp.com", is_vendor=True)

    mock_s3 = MagicMock()
    s3_store = {}

    def mock_put_object(Bucket, Key, Body, **kwargs):
        s3_store[Key] = Body
        return {"ETag": "etag"}

    def mock_get_object(Bucket, Key):
        if Key not in s3_store:
            error_response = {"Error": {"Code": "NoSuchKey", "Message": "Key not found"}}
            raise ClientError(error_response, "GetObject")
        body_mock = MagicMock()
        body_mock.read.return_value = s3_store[Key]
        return {"Body": body_mock, "ContentType": "application/pdf"}

    def mock_head_object(Bucket, Key):
        if Key not in s3_store:
            error_response = {"Error": {"Code": "404", "Message": "Not found"}}
            raise ClientError(error_response, "HeadObject")
        return {"ContentLength": len(s3_store[Key])}

    def mock_delete_object(Bucket, Key):
        s3_store.pop(Key, None)
        return {"DeleteMarker": True}

    mock_s3.put_object.side_effect = mock_put_object
    mock_s3.get_object.side_effect = mock_get_object
    mock_s3.head_object.side_effect = mock_head_object
    mock_s3.delete_object.side_effect = mock_delete_object

    env_overrides = {
        "STORAGE_BACKEND": "s3",
        "S3_ENDPOINT_URL": "https://r2.cloudflarestorage.com",
        "S3_BUCKET_NAME": "vms-jds",
        "S3_ACCESS_KEY_ID": "mock-key",
        "S3_SECRET_ACCESS_KEY": "mock-secret"
    }

    with patch.dict(os.environ, env_overrides):
        with patch.object(StorageManager, "get_s3_client", return_value=mock_s3):
            # 1. Recruiter creates job role with JD
            jd_bytes = b"%PDF-1.4 Cloudflare R2 JD Content %%EOF"
            files = {"file": ("Backend_Lead_JD.pdf", io.BytesIO(jd_bytes), "application/pdf")}
            data = {
                "department_id": str(dept.id),
                "title": "Principal Storage Architect",
                "job_id": "JOB-S3-ARCH-01",
                "vendor_id": str(vendor.id)
            }
            create_resp = client.post("/api/v1/recruiter/job-roles", data=data, files=files, headers=rec_headers)
            assert create_resp.status_code == 201
            role_id = create_resp.json()["id"]

            # Verify in DB: jd_file_path is an object key (not absolute disk path)
            db_role = db_session.query(JobRole).filter(JobRole.id == role_id).first()
            assert db_role is not None
            assert not os.path.isabs(db_role.jd_file_path)
            assert db_role.jd_file_path.startswith("jd_")
            assert db_role.jd_file_path in s3_store

            # 2. Vendor views JD inline
            view_resp = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd", headers=vendor_headers)
            assert view_resp.status_code == 200
            assert view_resp.content == jd_bytes
            assert "inline" in view_resp.headers.get("content-disposition", "")
            assert view_resp.headers["content-type"] == "application/pdf"

            # 3. Vendor downloads JD as attachment
            dl_resp = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd?download=true", headers=vendor_headers)
            assert dl_resp.status_code == 200
            assert dl_resp.content == jd_bytes
            assert "attachment" in dl_resp.headers.get("content-disposition", "")

            # 4. Recruiter replaces JD
            jd_v2_bytes = b"%PDF-1.4 Updated R2 JD Content v2 %%EOF"
            files_v2 = {"file": ("Backend_Lead_JD_v2.pdf", io.BytesIO(jd_v2_bytes), "application/pdf")}
            replace_resp = client.post(f"/api/v1/recruiter/job-roles/{role_id}/jd", files=files_v2, headers=rec_headers)
            assert replace_resp.status_code == 200

            # Verify recruiter download returns v2
            rec_dl = client.get(f"/api/v1/recruiter/job-roles/{role_id}/jd", headers=rec_headers)
            assert rec_dl.status_code == 200
            assert rec_dl.content == jd_v2_bytes

            # 5. Recruiter deletes JD
            del_resp = client.delete(f"/api/v1/recruiter/job-roles/{role_id}/jd", headers=rec_headers)
            assert del_resp.status_code == 200
            assert del_resp.json()["has_jd"] is False

            # Verify 404 after deletion
            after_del = client.get(f"/api/v1/recruiter/job-roles/{role_id}/jd", headers=rec_headers)
            assert after_del.status_code == 404


def test_resume_upload_and_download_e2e_with_mocked_s3(client: TestClient, db_session: Session):
    """
    Test resume upload and download with S3/R2 storage backend mocked.
    """
    dept, recruiter, vendor, user = setup_storage_test_data(db_session)
    vendor_headers = get_auth_header(client, "vendor_storage@corp.com", is_vendor=True)

    mock_s3 = MagicMock()
    s3_resumes = {}

    def mock_put_object(Bucket, Key, Body, **kwargs):
        s3_resumes[Key] = Body
        return {"ETag": "etag"}

    def mock_get_object(Bucket, Key):
        if Key not in s3_resumes:
            error_response = {"Error": {"Code": "NoSuchKey", "Message": "Key not found"}}
            raise ClientError(error_response, "GetObject")
        body_mock = MagicMock()
        body_mock.read.return_value = s3_resumes[Key]
        return {"Body": body_mock, "ContentType": "application/pdf"}

    def mock_head_object(Bucket, Key):
        if Key not in s3_resumes:
            error_response = {"Error": {"Code": "404", "Message": "Not found"}}
            raise ClientError(error_response, "HeadObject")
        return {"ContentLength": len(s3_resumes[Key])}

    mock_s3.put_object.side_effect = mock_put_object
    mock_s3.get_object.side_effect = mock_get_object
    mock_s3.head_object.side_effect = mock_head_object

    env_overrides = {
        "STORAGE_BACKEND": "s3",
        "S3_ENDPOINT_URL": "https://r2.cloudflarestorage.com",
        "S3_BUCKET_NAME": "vms-resumes",
        "S3_ACCESS_KEY_ID": "mock-key",
        "S3_SECRET_ACCESS_KEY": "mock-secret"
    }

    with patch.dict(os.environ, env_overrides):
        with patch.object(StorageManager, "get_s3_client", return_value=mock_s3):
            # 1. Upload Resume
            resume_bytes = b"%PDF-1.4 Mock Candidate Resume Data %%EOF"
            files = {"file": ("candidate_profile.pdf", io.BytesIO(resume_bytes), "application/pdf")}
            up_resp = client.post("/api/v1/resumes", files=files, headers=vendor_headers)
            assert up_resp.status_code == 202
            resume_data = up_resp.json()
            resume_id = resume_data["resume_id"]

            # Verify in DB: file_path is the object key
            db_res = db_session.query(Resume).filter(Resume.id == resume_id).first()
            assert db_res is not None
            assert not os.path.isabs(db_res.file_path)
            assert db_res.file_path == f"{resume_id}.pdf"
            assert db_res.file_path in s3_resumes

            # Set states to allow download (VALID, CLEAN, COMPLETED)
            db_res.validation_state = "VALID"
            db_res.malware_scan_state = "CLEAN"
            db_res.processing_state = "COMPLETED"
            db_session.commit()

            # 2. Download Resume
            dl_resp = client.get(f"/api/v1/resumes/{resume_id}/download", headers=vendor_headers)
            assert dl_resp.status_code == 200
            assert dl_resp.content == resume_bytes
            assert "attachment" in dl_resp.headers.get("content-disposition", "")
            assert dl_resp.headers["content-type"] == "application/pdf"


def test_legacy_path_compatibility(tmp_path):
    """
    Test that StorageManager handles legacy paths cleanly in both local and S3 mode.
    """
    test_storage_dir = str(tmp_path / "legacy_storage")
    os.makedirs(test_storage_dir, exist_ok=True)
    sample_file = os.path.join(test_storage_dir, "legacy_doc.pdf")
    content = b"%PDF legacy content"
    with open(sample_file, "wb") as f:
        f.write(content)

    # Local mode: pass absolute path or relative key
    with patch.dict(os.environ, {"STORAGE_BACKEND": "local", "STORAGE_DIR": test_storage_dir}):
        assert StorageManager.file_exists(sample_file) is True
        assert StorageManager.get_file(sample_file) == content
        assert StorageManager.file_exists("legacy_doc.pdf") is True
        assert StorageManager.get_file("legacy_doc.pdf") == content

    # S3 mode: if an absolute path string is passed, key resolution extracts basename
    mock_s3 = MagicMock()
    body_mock = MagicMock()
    body_mock.read.return_value = content
    mock_s3.get_object.return_value = {"Body": body_mock}
    mock_s3.head_object.return_value = {"ContentLength": len(content)}

    with patch.dict(os.environ, {"STORAGE_BACKEND": "s3", "S3_BUCKET_NAME": "vms-bucket"}):
        with patch.object(StorageManager, "get_s3_client", return_value=mock_s3):
            assert StorageManager.get_file(sample_file) == content
            mock_s3.get_object.assert_called_with(Bucket="vms-bucket", Key="legacy_doc.pdf")
