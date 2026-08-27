import json
import hashlib
from uuid import UUID
from typing import Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.models import AuditEvent, IdempotencyRecord, Candidate
from db.crypto import normalize_pan, get_pan_fingerprint, encrypt_pan, decrypt_pan

# ----------------- AUDIT SERVICE -----------------
class AuditService:
    @staticmethod
    def log_event(
        db: Session,
        actor_type: str,
        actor_id: Optional[UUID],
        event_type: str,
        entity_type: str,
        entity_id: Optional[UUID],
        payload: dict
    ) -> AuditEvent:
        """
        Atomically records a system or business audit log in audit_events.
        Scrubs any sensitive parameters like passwords, hashes, and full PANs.
        """
        # Scrub sensitive payload keys
        cleaned_payload = payload.copy()
        sensitive_keys = ["password", "password_hash", "confirm_password", "pan", "pan_encrypted"]
        
        for key in sensitive_keys:
            if key in cleaned_payload:
                cleaned_payload[key] = "********"
                
        # Additionally scrub nested keys
        if "candidate" in cleaned_payload and isinstance(cleaned_payload["candidate"], dict):
            cand = cleaned_payload["candidate"].copy()
            for key in ["pan", "contact_number"]:
                if key in cand:
                    cand[key] = "********"
            cleaned_payload["candidate"] = cand
            
        event = AuditEvent(
            actor_type=actor_type,
            actor_id=actor_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=cleaned_payload
        )
        db.add(event)
        # Flush to generate ID and verify database triggers (do not commit here as it's part of parent tx)
        db.flush()
        return event

# ----------------- IDEMPOTENCY SERVICE -----------------
class IdempotencyService:
    @staticmethod
    def get_hash(payload: dict) -> str:
        """
        Generate a stable SHA256 hash of a JSON payload dictionary.
        """
        serialized = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @classmethod
    def find_record(cls, db: Session, key: str, vendor_user_id: UUID) -> Optional[IdempotencyRecord]:
        """
        Look up an existing idempotency record by key and vendor_user_id.
        Automatically removes expired records.
        """
        record = db.query(IdempotencyRecord).filter(
            IdempotencyRecord.key == key,
            IdempotencyRecord.vendor_user_id == vendor_user_id
        ).first()
        
        if record:
            now = datetime.now(timezone.utc)
            # Ensure expires_at is timezone-aware
            expires_at = record.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < now:
                db.delete(record)
                db.commit()
                return None
            return record
        return None

    @classmethod
    def save_record(
        cls,
        db: Session,
        key: str,
        vendor_user_id: UUID,
        request_hash: str,
        response_status_code: int,
        response_body: str,
        ttl_hours: int = 24
    ) -> IdempotencyRecord:
        """
        Persists a response representation keyed by idempotency properties.
        """
        expires_at = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
        record = IdempotencyRecord(
            key=key,
            vendor_user_id=vendor_user_id,
            request_hash=request_hash,
            response_status_code=response_status_code,
            response_body=response_body,
            expires_at=expires_at
        )
        db.add(record)
        db.flush()
        return record
