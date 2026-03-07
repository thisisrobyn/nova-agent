"""Safe calculator tool for NOVA.

Evaluates mathematical expressions without exposing ``eval()`` to
arbitrary code.  Only numeric literals and basic operators are allowed.
"""

import ast
import logging
import math
import operator
from typing import Union

from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# Allowed binary operators
_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

# Allowed unary operators
_UNARY = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

# Safe math constants and single-arg functions
_MATH_NAMES: dict = {
    "pi": math.pi,
    "e": math.e,
    "sqrt": math.sqrt,
    "abs": abs,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "ceil": math.ceil,
    "floor": math.floor,
}


def _safe_eval(node: ast.AST) -> Union[int, float]:
    """Recursively evaluate an AST node containing only safe math."""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)

    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value

    if isinstance(node, ast.Name) and node.id in _MATH_NAMES:
        val = _MATH_NAMES[node.id]
        if callable(val):
            raise ValueError(f"'{node.id}' is a function — use {node.id}(…)")
        return val

    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_safe_eval(node.operand))

    if isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
        left = _safe_eval(node.left)
        right = _safe_eval(node.right)
        return _OPERATORS[type(node.op)](left, right)

    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id in _MATH_NAMES:
            func = _MATH_NAMES[node.func.id]
            if callable(func):
                args = [_safe_eval(a) for a in node.args]
                return func(*args)
        raise ValueError(f"Function '{getattr(node.func, 'id', '?')}' not allowed")

    raise ValueError(f"Unsupported expression: {ast.dump(node)}")


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression safely.

    Supports basic arithmetic (+, -, *, /, //, %, **) and common math
    functions (sqrt, sin, cos, tan, log, log10, ceil, floor, abs).
    Constants ``pi`` and ``e`` are available.

    Args:
        expression: A math expression, e.g. "sqrt(144) + 3 * pi".

    Returns:
        The result as a string, or an error message if the expression
        is invalid.
    """
    try:
        tree = ast.parse(expression.strip(), mode="eval")
        result = _safe_eval(tree)
        logger.debug("calculator: %s = %s", expression, result)
        return str(result)
    except ZeroDivisionError:
        return "Error: division by zero."
    except Exception as e:
        logger.error("calculator failed for '%s': %s", expression, e)
        return f"Error: could not evaluate '{expression}' – {e}"
