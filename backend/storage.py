import os
from backend.config import STORAGE_DIR

class StorageManager:
    @staticmethod
    def save_file(file_id: str, content: bytes, filename: str) -> str:
        """
        Saves file contents to a private directory with a safe path.
        Returns the absolute file path on disk.
        """
        # Save file using file_id to prevent naming collisions
        _, ext = os.path.splitext(filename)
        safe_filename = f"{file_id}{ext.lower()}"
        file_path = os.path.join(STORAGE_DIR, safe_filename)
        
        with open(file_path, "wb") as f:
            f.write(content)
        return file_path

    @staticmethod
    def get_file(file_path: str) -> bytes:
        """
        Reads raw binary content from the private storage directory.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError("Requested file does not exist in private storage.")
            
        with open(file_path, "rb") as f:
            return f.read()
