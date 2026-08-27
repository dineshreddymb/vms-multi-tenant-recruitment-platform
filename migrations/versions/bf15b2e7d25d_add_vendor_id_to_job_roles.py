"""add_vendor_id_to_job_roles

Revision ID: bf15b2e7d25d
Revises: 229380eb06aa
Create Date: 2026-08-24 14:25:05.561167

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bf15b2e7d25d'
down_revision: Union[str, Sequence[str], None] = '229380eb06aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('job_roles', sa.Column('vendor_id', sa.UUID(), nullable=False))
    op.create_foreign_key('fk_job_roles_vendor_id', 'job_roles', 'vendors', ['vendor_id'], ['id'], ondelete='RESTRICT')


def downgrade() -> None:
    op.drop_constraint('fk_job_roles_vendor_id', 'job_roles', type_='foreignkey')
    op.drop_column('job_roles', 'vendor_id')
