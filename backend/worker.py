import os
import time
import logging
from uuid import UUID
from datetime import datetime, timezone
import fitz  # PyMuPDF
import PyPDF2
import re

from backend.config import DATABASE_URL
from backend.database import SessionLocal
from backend.storage import StorageManager
from backend.malware_scanner import ClamAVMalwareScanner, LocalMalwareScanner
from backend.queue import DbQueueBroker
from backend.services import AuditService
from db.models import Resume, ResumeExtraction

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("vms-resume-worker")

EMAIL_REGEX = re.compile(r"[\w\.-]+@[\w\.-]+\.\w+")
PHONE_REGEX = re.compile(r"(?:\+91|0)?[6-9]\d{9}")

def extract_text_from_pdf(file_content: bytes) -> str:
    """
    Extracts text from PDF bytes. Try PyMuPDF (fitz) first, fallback to PyPDF2.
    """
    text = ""
    try:
        # Try PyMuPDF
        doc = fitz.open(stream=file_content, filetype="pdf")
        for page in doc:
            page_text = page.get_text()
            if page_text:
                text += page_text + "\n"
        doc.close()
        if text.strip():
            return text
    except Exception as e:
        logger.warning(f"PyMuPDF extraction failed, trying PyPDF2: {e}")

    try:
        # Fallback to PyPDF2
        pdf_file = PyPDF2.PdfReader(fitz.io.BytesIO(file_content))
        for page in pdf_file.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    except Exception as e:
        logger.error(f"PyPDF2 extraction failed: {e}")
        raise ValueError("Could not parse PDF text contents.")

def parse_resume_text(text: str) -> dict:
    """
    Deterministic regex-based parsing to extract candidate info.
    """
    extracted = {
        "name": "",
        "email": "",
        "contact_number": "",
        "skills": [],
        "experience": 0.0
    }
    
    # 1. Email extraction
    email_match = EMAIL_REGEX.search(text)
    if email_match:
        extracted["email"] = email_match.group(0)

    # 2. Contact number extraction
    phone_match = PHONE_REGEX.search(text)
    if phone_match:
        extracted["contact_number"] = phone_match.group(0)

    # 3. Name extraction (heuristic: grab the first line containing text and no numbers)
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    for line in lines[:3]:
        if len(line) > 2 and not any(char.isdigit() for char in line) and "@" not in line:
            extracted["name"] = line
            break

    # 4. Skills detection (from simple dictionary)
    skills_dict = ["python", "java", "react", "next.js", "javascript", "typescript", "fastapi", "sql", "postgresql", "aws", "docker", "excel", "sales"]
    for skill in skills_dict:
        if re.search(r"\b" + re.escape(skill) + r"\b", text, re.IGNORECASE):
            extracted["skills"].append(skill.title())

    # 5. Experience years detection
    exp_matches = re.findall(r"(\d+(?:\.\d+)?)\s*(?:years|yrs|year)\b", text, re.IGNORECASE)
    if exp_matches:
        try:
            extracted["experience"] = float(exp_matches[0])
        except ValueError:
            pass

    return extracted

def process_resume(resume_id: UUID) -> bool:
    """
    Process a single resume. Handles validation, scanning, parsing and eligibility.
    Returns True if successful, False if failed.
    """
    db = SessionLocal()
    try:
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if not resume:
            logger.error(f"Resume {resume_id} not found in database.")
            return False

        logger.info(f"Processing Resume {resume_id}: {resume.filename}")

        # 1. Fetch file content
        try:
            content = StorageManager.get_file(resume.file_path)
        except Exception as e:
            logger.error(f"Failed to retrieve file from storage: {e}")
            resume.processing_state = "FAILED"
            resume.eligibility_state = "INELIGIBLE"
            db.commit()
            return False

        # 2. File validation check
        if not content.startswith(b"%PDF") or resume.file_size > 10 * 1024 * 1024:
            resume.validation_state = "INVALID"
            resume.processing_state = "FAILED"
            resume.eligibility_state = "INELIGIBLE"
            db.commit()
            logger.warning(f"Resume {resume_id} failed file validation.")
            return False
        
        resume.validation_state = "VALID"

        # 3. Malware / Security scanning check
        scanner = ClamAVMalwareScanner()
        scan_status, scan_details = scanner.scan_file(content)

        # Fallback to local heuristic scanner only in development/testing env if ClamAV is offline
        is_dev_or_test = os.getenv("ENV", "development").lower() in ("development", "testing")
        if scan_status == "ERROR/UNAVAILABLE" and is_dev_or_test:
            logger.warning("ClamAV offline. Falling back to local structural scanner in development/testing environment.")
            local_scanner = LocalMalwareScanner()
            scan_status, scan_details = local_scanner.scan_file(content)

        logger.info(f"Malware Scan Status for {resume_id}: {scan_status} ({scan_details})")

        if scan_status == "CLEAN":
            resume.malware_scan_state = "CLEAN"
        elif scan_status == "INFECTED":
            resume.malware_scan_state = "INFECTED"
            resume.processing_state = "FAILED"
            resume.eligibility_state = "INELIGIBLE"
            db.commit()
            return False
        else: # ERROR/UNAVAILABLE (Scanner offline)
            # Fail-safe: do NOT mark clean, keep scanning state pending or unavailable
            resume.malware_scan_state = "PENDING"
            resume.processing_state = "FAILED"
            resume.eligibility_state = "INELIGIBLE"
            db.commit()
            logger.error(f"Malware scanner unavailable. Failing Resume {resume_id} safely.")
            return False

        # 4. Text extraction & parsing
        try:
            text_content = extract_text_from_pdf(content)
            extracted_data = parse_resume_text(text_content)
        except Exception as e:
            logger.error(f"Text extraction failed: {e}")
            resume.processing_state = "FAILED"
            resume.eligibility_state = "INELIGIBLE"
            db.commit()
            return False

        # 5. Save Extraction Results
        parser_ver = "1.0"
        extraction = db.query(ResumeExtraction).filter(ResumeExtraction.resume_id == resume.id).first()
        if not extraction:
            extraction = ResumeExtraction(
                resume_id=resume.id,
                extracted_data=extracted_data,
                parser_version=parser_ver
            )
            db.add(extraction)
        else:
            extraction.extracted_data = extracted_data
            extraction.parser_version = parser_ver

        # 6. Update states
        resume.parser_version = parser_ver
        resume.processing_state = "COMPLETED"
        
        # Enforce strict V17 automatic eligibility rule
        if (
            resume.validation_state == "VALID" and
            resume.malware_scan_state == "CLEAN" and
            resume.processing_state == "COMPLETED"
        ):
            resume.eligibility_state = "ELIGIBLE"
        else:
            resume.eligibility_state = "INELIGIBLE"

        # Log Audit Event
        AuditService.log_event(
            db=db,
            actor_type="SYSTEM",
            actor_id=None,
            event_type="RESUME_PROCESSED_SUCCESSFULLY",
            entity_type="RESUME",
            entity_id=resume.id,
            payload={
                "filename": resume.filename,
                "eligibility": resume.eligibility_state,
                "extracted_email": extracted_data.get("email")
            }
        )
        db.commit()
        logger.info(f"Resume {resume_id} processed successfully. State: {resume.eligibility_state}")
        return True

    except Exception as e:
        logger.error(f"Unexpected error processing Resume {resume_id}: {e}")
        try:
            db.rollback()
            # Mark processing as failed on crash
            resume = db.query(Resume).filter(Resume.id == resume_id).first()
            if resume:
                resume.processing_state = "FAILED"
                resume.eligibility_state = "INELIGIBLE"
                db.commit()
        except Exception as rollback_err:
            logger.critical(f"Rollback/state update failed: {rollback_err}")
        return False
    finally:
        db.close()

def run_worker():
    """
    Poller running in a separate OS process, locking tasks via DbQueueBroker.
    """
    logger.info("VMS Resume worker process started. Polling database queue...")
    broker = DbQueueBroker()
    
    # Run loop
    while True:
        db = SessionLocal()
        try:
            # Dequeue locks a job using SELECT FOR UPDATE SKIP LOCKED
            resume_id = broker.dequeue_resume_job(db)
            if resume_id:
                # Process the locked job
                process_resume(resume_id)
            else:
                # Sleep briefly if no jobs found
                time.sleep(1.5)
        except Exception as e:
            logger.error(f"Error in polling loop: {e}")
            time.sleep(2)
        finally:
            db.close()

if __name__ == "__main__":
    run_worker()
