import os
import hmac
import hashlib
import base64
from cryptography.fernet import Fernet

# Load keys from environment, with secure fallback defaults for development
# Fernet key must be a 32-byte url-safe base64-encoded key
DEFAULT_KEY = base64.urlsafe_b64encode(b"vms_secure_pan_encryption_32byte")
ENCRYPTION_KEY = os.getenv("PAN_ENCRYPTION_KEY", DEFAULT_KEY.decode("utf-8"))
HMAC_SALT = os.getenv("PAN_HMAC_SALT", "vms_deterministic_pan_salt_key").encode("utf-8")

fernet = Fernet(ENCRYPTION_KEY.encode("utf-8"))

def normalize_pan(pan: str) -> str:
    """
    Standardize PAN format: strip whitespace, convert to uppercase.
    Indian PAN is 10 alphanumeric characters.
    """
    if not pan:
        return ""
    return "".join(pan.split()).upper()

def get_pan_fingerprint(pan: str) -> str:
    """
    Generate deterministic keyed PAN fingerprint using HMAC-SHA256.
    Allows unique constraint checking without storing PAN in plaintext or indexable text.
    """
    norm_pan = normalize_pan(pan)
    if not norm_pan:
        return ""
    h = hmac.new(HMAC_SALT, norm_pan.encode("utf-8"), hashlib.sha256)
    return h.hexdigest()

def encrypt_pan(pan: str) -> str:
    """
    Encrypt the normalized PAN card value.
    """
    norm_pan = normalize_pan(pan)
    if not norm_pan:
        return ""
    return fernet.encrypt(norm_pan.encode("utf-8")).decode("utf-8")

def decrypt_pan(encrypted_pan: str) -> str:
    """
    Decrypt the PAN card value back to plaintext normalized format.
    """
    if not encrypted_pan:
        return ""
    return fernet.decrypt(encrypted_pan.encode("utf-8")).decode("utf-8")
