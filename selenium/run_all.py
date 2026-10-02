"""Executa juntos os testes de Victor e Murilo, de qualquer diretório."""
import importlib.util
from pathlib import Path
import unittest


def main():
    aqui = Path(__file__).resolve().parent
    test_files = (
        ("tests_victor", aqui / "test_app.py"),
        ("tests_murilo", aqui / "test_reels.py"),
    )
    suite = unittest.TestSuite()
    for name, path in test_files:
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))

    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
