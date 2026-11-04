import shutil
import subprocess
import unittest
from pathlib import Path


class StudioCoreTests(unittest.TestCase):
    def test_canvas_layout_and_page_size_helpers_in_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js required for browser canvas helper tests")
        result = subprocess.run([node, str(Path(__file__).with_suffix(".js"))],
                                capture_output=True, text=True, timeout=8)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("studio core tests OK", result.stdout)


if __name__ == "__main__":
    unittest.main()
