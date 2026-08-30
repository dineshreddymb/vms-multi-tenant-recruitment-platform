"""add multi-tenancy columns and backfill

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-30 11:41:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'bf15b2e7d25d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add is_tenant to vendors
    op.add_column(
        'vendors',
        sa.Column('is_tenant', sa.Boolean(), server_default=sa.text('false'), nullable=False)
    )

    # 2. Add submitting_agency_id to submissions
    op.add_column(
        'submissions',
        sa.Column('submitting_agency_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        'fk_submissions_submitting_agency_id_vendors',
        'submissions',
        'vendors',
        ['submitting_agency_id'],
        ['id'],
        ondelete='RESTRICT'
    )

    # 3. Backfill tenants
    op.execute(
        "UPDATE vendors SET is_tenant = true WHERE normalized_name IN ('iosys', 'volantis')"
    )

    # 4. Backfill submitting_agency_id from vendor_users.vendor_id where historical relation is resolvable
    op.execute(
        """
        UPDATE submissions
        SET submitting_agency_id = (
            SELECT vu.vendor_id
            FROM vendor_users vu
            WHERE vu.id = submissions.vendor_user_id
        )
        WHERE submissions.vendor_user_id IS NOT NULL
        AND submissions.submitting_agency_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint('fk_submissions_submitting_agency_id_vendors', 'submissions', type_='foreignkey')
    op.drop_column('submissions', 'submitting_agency_id')
    op.drop_column('vendors', 'is_tenant')
