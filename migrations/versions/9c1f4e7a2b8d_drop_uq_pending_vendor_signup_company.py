"""drop uq_pending_vendor_signup_company

Revision ID: 9c1f4e7a2b8d
Revises: 8a2e1f4b3c5d
Create Date: 2026-08-18 17:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c1f4e7a2b8d'
down_revision: Union[str, Sequence[str], None] = '8a2e1f4b3c5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("DROP INDEX IF EXISTS uq_pending_vendor_signup_company;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("CREATE UNIQUE INDEX uq_pending_vendor_signup_company ON vendor_signup_requests (normalized_company_name) WHERE status = 'PENDING';")
