"""update_unique_signup_indexes

Revision ID: f4ddda26983f
Revises: 95c745bc4445
Create Date: 2026-08-30 19:13:34.378353

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4ddda26983f'
down_revision: Union[str, Sequence[str], None] = '95c745bc4445'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # For recruiter_signup_requests: drop old index, create new one scoped to (email, company_id)
    op.execute("DROP INDEX IF EXISTS uq_pending_recruiter_signup;")
    op.execute("CREATE UNIQUE INDEX uq_pending_recruiter_signup ON recruiter_signup_requests (email, company_id) WHERE status = 'PENDING';")

    # For vendor_signup_requests: drop old index, create new one scoped to (email, vendor_id)
    op.execute("DROP INDEX IF EXISTS uq_pending_vendor_signup_email;")
    op.execute("CREATE UNIQUE INDEX uq_pending_vendor_signup_email ON vendor_signup_requests (email, vendor_id) WHERE status = 'PENDING';")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS uq_pending_vendor_signup_email;")
    op.execute("CREATE UNIQUE INDEX uq_pending_vendor_signup_email ON vendor_signup_requests (email) WHERE status = 'PENDING';")

    op.execute("DROP INDEX IF EXISTS uq_pending_recruiter_signup;")
    op.execute("CREATE UNIQUE INDEX uq_pending_recruiter_signup ON recruiter_signup_requests (email) WHERE status = 'PENDING';")
