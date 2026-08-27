"""add vendor_user_memberships and multi-company support

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-18 23:50:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create vendor_user_memberships table
    op.create_table(
        'vendor_user_memberships',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('vendor_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('vendor_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('vendor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('vendors.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='ACTIVE', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('ACTIVE', 'DISABLED')", name='chk_vendor_user_membership_status'),
        sa.UniqueConstraint('vendor_user_id', 'vendor_id', name='uq_vendor_user_membership')
    )

    op.create_index('ix_vendor_user_memberships_vendor_user_id', 'vendor_user_memberships', ['vendor_user_id'])
    op.create_index('ix_vendor_user_memberships_vendor_id', 'vendor_user_memberships', ['vendor_id'])

    # 2. Make vendor_users.vendor_id nullable (retained for legacy backward-compatibility)
    op.alter_column('vendor_users', 'vendor_id', nullable=True)

    # 3. Add requested_companies JSONB column to vendor_signup_requests
    op.add_column('vendor_signup_requests', sa.Column('requested_companies', postgresql.JSONB, nullable=True))

    # 4. Ensure canonical vendors 'IOSYS' and 'Volantis' exist in vendors table
    op.execute(sa.text("""
        INSERT INTO vendors (id, name, normalized_name, created_at, updated_at)
        VALUES 
            (gen_random_uuid(), 'IOSYS', 'iosys', now(), now()),
            (gen_random_uuid(), 'Volantis', 'volantis', now(), now())
        ON CONFLICT (normalized_name) DO NOTHING;
    """))

    # 5. Data Migration: Populate vendor_user_memberships from existing vendor_users
    op.execute(sa.text("""
        INSERT INTO vendor_user_memberships (id, vendor_user_id, vendor_id, status, created_at, updated_at)
        SELECT 
            gen_random_uuid(),
            vu.id,
            vu.vendor_id,
            vu.status,
            vu.created_at,
            vu.updated_at
        FROM vendor_users vu
        WHERE vu.vendor_id IS NOT NULL
        ON CONFLICT (vendor_user_id, vendor_id) DO NOTHING;
    """))

    # 6. Data Migration: Backfill requested_companies in vendor_signup_requests from company_name
    op.execute(sa.text("""
        UPDATE vendor_signup_requests
        SET requested_companies = jsonb_build_array(company_name)
        WHERE requested_companies IS NULL AND company_name IS NOT NULL AND company_name != '';
    """))


def downgrade() -> None:
    op.drop_column('vendor_signup_requests', 'requested_companies')
    op.alter_column('vendor_users', 'vendor_id', nullable=False)
    op.drop_index('ix_vendor_user_memberships_vendor_id', table_name='vendor_user_memberships')
    op.drop_index('ix_vendor_user_memberships_vendor_user_id', table_name='vendor_user_memberships')
    op.drop_table('vendor_user_memberships')
