import sys
import types
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault('asyncpg', types.SimpleNamespace(create_pool=None))
sys.modules.setdefault('psutil', types.SimpleNamespace())

from models.schemas import TaskStatus
from core.state import DashboardState


class TodoPrLinkStateTests(unittest.TestCase):
    def setUp(self):
        DashboardState._instance = None
        self.state = DashboardState()
        self.state._schedule = lambda coro: coro.close()

    def tearDown(self):
        DashboardState._instance = None

    def test_create_todo_keeps_pr_metadata(self):
        todo = self.state.create_todo(
            'Ship the feature',
            status=TaskStatus.PENDING,
            assigned_agent='coder',
            pr_required=True,
            pr_link='https://github.com/acme/project/pull/42',
        )

        self.assertTrue(todo.pr_required)
        self.assertEqual(todo.pr_link, 'https://github.com/acme/project/pull/42')

    def test_update_todo_changes_pr_metadata(self):
        todo = self.state.create_todo('Ship the feature')

        updated = self.state.update_todo(
            todo.id,
            pr_required=True,
            pr_link='https://github.com/acme/project/pull/99',
        )

        self.assertIsNotNone(updated)
        self.assertTrue(updated.pr_required)
        self.assertEqual(updated.pr_link, 'https://github.com/acme/project/pull/99')

    def test_set_todos_preserves_local_pr_metadata_when_sync_payload_omits_it(self):
        current = self.state.create_todo(
            'Ship the feature',
            assigned_agent='coder',
            pr_required=True,
            pr_link='https://github.com/acme/project/pull/42',
        )

        synced = self.state.create_todo('Ship the feature from sync')
        synced.id = current.id
        synced.assigned_agent = None
        synced.pr_required = False
        synced.pr_link = None

        self.state.set_todos([synced])

        self.assertEqual(len(self.state.todos), 1)
        merged = self.state.todos[0]
        self.assertEqual(merged.assigned_agent, 'coder')
        self.assertTrue(merged.pr_required)
        self.assertEqual(merged.pr_link, 'https://github.com/acme/project/pull/42')


if __name__ == '__main__':
    unittest.main()
