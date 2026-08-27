"""add_recruiter_reference_to_internal_users

Revision ID: 5e8a1490c94f
Revises: 229ff2e6cb6f
Create Date: 2026-08-21 22:16:43.746137

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e8a1490c94f'
down_revision: Union[str, Sequence[str], None] = '229ff2e6cb6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add recruiter_reference column allowing NULL initially
    op.add_column('internal_users', sa.Column('recruiter_reference', sa.String(length=100), nullable=True))
    
    # 2. Backfill existing internal users sequentially ordered by created_at and id
    connection = op.get_bind()
    connection.execute(sa.text("""
        WITH numbered_users AS (
            SELECT 
                id, 
                'RU' || lpad(row_number() OVER (ORDER BY created_at, id)::text, 3, '0') AS ref
            FROM internal_users
        )
        UPDATE internal_users u
        SET recruiter_reference = nu.ref
        FROM numbered_users nu
        WHERE u.id = nu.id
    """))

    # 3. Alter column to nullable=False and add unique constraint
    op.alter_column('internal_users', 'recruiter_reference', nullable=False)
    op.create_unique_constraint('uq_recruiter_reference', 'internal_users', ['recruiter_reference'])


def downgrade() -> None:
    op.drop_constraint('uq_recruiter_reference', 'internal_users', type_='unique')
    op.drop_column('internal_users', 'recruiter_reference')
