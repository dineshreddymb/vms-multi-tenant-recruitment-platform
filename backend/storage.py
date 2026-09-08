import os
import logging
from typing import Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from backend import config

logger = logging.getLogger("fastapi")


class StorageManager:
    @classmethod
    def get_backend(cls) -> str:
        """
        Returns the active storage backend ('s3' or 'local').
        Dynamically checks environment or config.
        """
        env_backend = os.getenv("STORAGE_BACKEND")
        if env_backend:
            return env_backend.lower()
        if os.getenv("S3_ENDPOINT_URL") and os.getenv("S3_BUCKET_NAME"):
            return "s3"
        return getattr(config, "STORAGE_BACKEND", "local").lower()

    @classmethod
    def is_s3(cls) -> bool:
        return cls.get_backend() == "s3"

    @classmethod
    def get_s3_client(cls):
        """
        Returns a configured S3-compatible boto3 client for Cloudflare R2 / S3.
        """
        endpoint_url = os.getenv("S3_ENDPOINT_URL", getattr(config, "S3_ENDPOINT_URL", None))
        access_key_id = os.getenv("S3_ACCESS_KEY_ID", getattr(config, "S3_ACCESS_KEY_ID", None))
        secret_access_key = os.getenv("S3_SECRET_ACCESS_KEY", getattr(config, "S3_SECRET_ACCESS_KEY", None))
        region_name = os.getenv("S3_REGION", getattr(config, "S3_REGION", "auto"))

        return boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region_name or "auto",
            config=Config(signature_version="s3v4")
        )

    @classmethod
    def get_bucket_name(cls) -> str:
        bucket = os.getenv("S3_BUCKET_NAME", getattr(config, "S3_BUCKET_NAME", None))
        if not bucket:
            raise ValueError("S3_BUCKET_NAME is not configured.")
        return bucket

    @classmethod
    def get_storage_dir(cls) -> str:
        default_dir = os.path.join(getattr(config, "BASE_DIR", "."), "scratch", "storage")
        return os.getenv("STORAGE_DIR") or getattr(config, "STORAGE_DIR", default_dir)

    @classmethod
    def _resolve_local_path(cls, file_path_or_key: str) -> str:
        storage_dir = cls.get_storage_dir()
        if os.path.isabs(file_path_or_key):
            return file_path_or_key
        return os.path.join(storage_dir, file_path_or_key)

    @classmethod
    def _resolve_s3_key(cls, file_path_or_key: str) -> str:
        if os.path.isabs(file_path_or_key) or ("\\" in file_path_or_key):
            return os.path.basename(file_path_or_key)
        return file_path_or_key

    @classmethod
    def save_file(cls, file_id: str, content: bytes, filename: str, content_type: Optional[str] = None) -> str:
        """
        Saves file contents to S3/R2 object storage or local filesystem directory.
        In S3 mode, returns the object key.
        In local mode, returns the file path on disk.
        """
        _, ext = os.path.splitext(filename)
        safe_key = f"{file_id}{ext.lower()}"

        if cls.is_s3():
            client = cls.get_s3_client()
            bucket = cls.get_bucket_name()
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type
            client.put_object(
                Bucket=bucket,
                Key=safe_key,
                Body=content,
                **extra_args
            )
            return safe_key
        else:
            storage_dir = cls.get_storage_dir()
            try:
                os.makedirs(storage_dir, exist_ok=True)
            except Exception:
                pass
            file_path = os.path.join(storage_dir, safe_key)
            with open(file_path, "wb") as f:
                f.write(content)
            return file_path

    @classmethod
    def get_file(cls, file_path_or_key: str) -> bytes:
        """
        Reads raw binary content from S3/R2 or local private storage.
        """
        if cls.is_s3():
            client = cls.get_s3_client()
            bucket = cls.get_bucket_name()
            key = cls._resolve_s3_key(file_path_or_key)
            try:
                resp = client.get_object(Bucket=bucket, Key=key)
                return resp["Body"].read()
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in ("NoSuchKey", "404", "NoSuchBucket"):
                    raise FileNotFoundError(f"Requested object '{key}' does not exist in bucket '{bucket}'.") from e
                raise
        else:
            local_path = cls._resolve_local_path(file_path_or_key)
            if not os.path.exists(local_path):
                raise FileNotFoundError("Requested file does not exist in private storage.")
            with open(local_path, "rb") as f:
                return f.read()

    @classmethod
    def delete_file(cls, file_path_or_key: str) -> bool:
        """
        Deletes a file from S3/R2 or local storage.
        Returns True if deleted or already absent, False on unexpected error.
        """
        if not file_path_or_key:
            return True
        if cls.is_s3():
            client = cls.get_s3_client()
            bucket = cls.get_bucket_name()
            key = cls._resolve_s3_key(file_path_or_key)
            try:
                client.delete_object(Bucket=bucket, Key=key)
                return True
            except Exception as e:
                logger.warning(f"Failed to delete S3 object '{key}': {e}")
                return False
        else:
            local_path = cls._resolve_local_path(file_path_or_key)
            if os.path.exists(local_path):
                try:
                    os.remove(local_path)
                    return True
                except Exception as e:
                    logger.warning(f"Failed to delete local file '{local_path}': {e}")
                    return False
            return True

    @classmethod
    def file_exists(cls, file_path_or_key: str) -> bool:
        """
        Checks whether a file exists in S3/R2 or local storage.
        """
        if not file_path_or_key:
            return False
        if cls.is_s3():
            client = cls.get_s3_client()
            bucket = cls.get_bucket_name()
            key = cls._resolve_s3_key(file_path_or_key)
            try:
                client.head_object(Bucket=bucket, Key=key)
                return True
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in ("404", "NoSuchKey", "NotFound"):
                    return False
                return False
            except Exception:
                return False
        else:
            local_path = cls._resolve_local_path(file_path_or_key)
            return os.path.exists(local_path)
