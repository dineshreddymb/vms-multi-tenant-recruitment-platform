import os
import logging
import smtplib
from typing import Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger("vms.email")

# In-memory inbox to inspect emails in development/testing
dev_inbox = []

class EmailService:
    @staticmethod
    def send_password_reset_email(email: str, token: str, user_name: Optional[str] = None) -> str:
        """
        Sends a password reset email containing a reset link/token.
        Returns the reset link for development/testing convenience.
        """
        from backend.config import (
            RESET_URL_TEMPLATE,
            ENV,
            SMTP_HOST,
            SMTP_PORT,
            SMTP_USERNAME,
            SMTP_PASSWORD,
            SMTP_USE_TLS,
            EMAIL_FROM,
            PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        )
        
        reset_link = RESET_URL_TEMPLATE.format(token=token)
        subject = "Reset your VMS password"
        
        display_name = user_name if user_name else email.split("@")[0]
        
        body = (
            f"Hello {display_name},\n\n"
            f"We received a request to reset the password for your VMS account.\n\n"
            f"Click the link below to create a new password:\n\n"
            f"{reset_link}\n\n"
            f"This link will expire in {PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.\n\n"
            f"If you did not request a password reset, you can safely ignore this email.\n\n"
            f"Regards,\n"
            f"VMS Team"
        )
        
        is_testing = ENV == "testing" or os.getenv("ENV") == "testing"

        # In testing mode, populate dev_inbox and return without SMTP delivery
        if is_testing:
            dev_inbox.append({
                "to": email,
                "subject": subject,
                "body": body,
                "token": token,
                "link": reset_link
            })
            logger.info(f"Mock sending password reset email to {email}")
            return reset_link
            
        # If RESEND_API_KEY is configured, send via Resend HTTPS API (reliable in cloud environments like Railway)
        resend_api_key = os.getenv("RESEND_API_KEY")
        if resend_api_key and resend_api_key.strip():
            try:
                import httpx
                resend_from = os.getenv("RESEND_FROM") or "VMS Support <onboarding@resend.dev>"
                payload = {
                    "from": resend_from,
                    "to": [email],
                    "subject": subject,
                    "text": body
                }
                headers = {
                    "Authorization": f"Bearer {resend_api_key.strip()}",
                    "Content-Type": "application/json"
                }
                resp = httpx.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10.0)
                if resp.status_code in (200, 201):
                    logger.info("Successfully sent password reset email via Resend HTTPS API.")
                    return reset_link
                else:
                    logger.error("Resend API returned status %s: %s", resp.status_code, resp.text)
            except Exception as e:
                logger.error("Failed to send password reset email via Resend: %s", type(e).__name__)

        # In development or production mode, fallback to SMTP email
        # Do NOT print raw token or URL to logs or console
        try:
            msg = MIMEMultipart()
            msg["From"] = EMAIL_FROM
            msg["To"] = email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))
            
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                if SMTP_USE_TLS or SMTP_PORT == 587:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                if SMTP_USERNAME and SMTP_PASSWORD:
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
            logger.info("Successfully sent password reset email via SMTP.")
        except Exception as e:
            # Secure logging: do not expose raw token, credentials, or stack traces
            logger.error("Failed to send password reset SMTP email: %s", type(e).__name__)
            
        return reset_link
