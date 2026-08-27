"""add_vendor_user_reference_to_vendor_users

Revision ID: 229ff2e6cb6f
Revises: 2c5582306634
Create Date: 2026-08-21 22:03:58.849211

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '229ff2e6cb6f'
down_revision: Union[str, Sequence[str], None] = '2c5582306634'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add vendor_user_reference column allowing NULL initially
    op.add_column('vendor_users', sa.Column('vendor_user_reference', sa.String(length=100), nullable=True))
    
    # 2. Backfill existing vendor users deterministically ordered by created_at and id
    connection = op.get_bind()
    connection.execute(sa.text("""
        WITH numbered_users AS (
            SELECT 
                id, 
                'VU' || lpad(row_number() OVER (ORDER BY created_at, id)::text, 3, '0') AS ref
            FROM vendor_users
        )
        UPDATE vendor_users u
        SET vendor_user_reference = nu.ref
        FROM numbered_users nu
        WHERE u.id = nu.id
    """))

    # 3. Alter column to be nullable=False and add unique constraint
    op.alter_column('vendor_users', 'vendor_user_reference', nullable=False)
    op.create_unique_constraint('uq_vendor_user_reference', 'vendor_users', ['vendor_user_reference'])


def downgrade() -> None:
    op.drop_constraint('uq_vendor_user_reference', 'vendor_users', type_='unique')
    op.drop_column('vendor_users', 'vendor_user_reference')
