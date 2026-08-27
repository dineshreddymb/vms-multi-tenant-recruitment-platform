"""add job_id to job_roles

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-18 18:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Add column as nullable initially
    op.add_column('job_roles', sa.Column('job_id', sa.String(length=100), nullable=True))

    # 2. Backfill existing job_roles with deterministic unique Job IDs
    op.execute(sa.text("""
        WITH numbered AS (
            SELECT id, 'JOB-' || (10000 + ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)) AS gen_job_id
            FROM job_roles
        )
        UPDATE job_roles
        SET job_id = numbered.gen_job_id
        FROM numbered
        WHERE job_roles.id = numbered.id AND (job_roles.job_id IS NULL OR job_roles.job_id = '');
    """))

    # 3. Backfill submissions where job_id is null using the linked role's job_id
    op.execute(sa.text("""
        UPDATE submissions
        SET job_id = job_roles.job_id
        FROM job_roles
        WHERE submissions.role_id = job_roles.id AND (submissions.job_id IS NULL OR submissions.job_id = '');
    """))

    # 4. Alter column to NOT NULL
    op.alter_column('job_roles', 'job_id', nullable=False)

    # 5. Create UNIQUE index
    op.create_index('uq_job_roles_job_id', 'job_roles', ['job_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_job_roles_job_id', table_name='job_roles')
    op.drop_column('job_roles', 'job_id')
