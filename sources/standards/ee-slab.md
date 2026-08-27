# Slab 12: G6–7 Expressions & Equations

Second standards-first slab (see `slab-map.md`). Closes the lineq audit
gaps and — the saturation claim's first test — needed **zero new widget
types**: area-model (finally adopted; the zoo fallback auto-hid),
balance-scale (with new add/subtract op badges), ratio-table (as a
function-machine table), and worked-equation cover everything.

## Implemented (8 skills, 17 items, 16 explanations)

| skill | standard | primary rep | notes |
|---|---|---|---|
| g6.ee.exponents | 6.EE.A.1 | area-model | c² as a literal square |
| g6.ee.evaluate | 6.EE.A.2c | worked | + function-machine table |
| g6.ee.write-expression | 6.EE.A.2a | worked | OPEN-expression answers (below) |
| g6.ee.equivalent | 6.EE.A.3/4 | area-model | expand; `form: expanded` guard |
| g6.ee.add-solve | 6.EE.B.7 | balance-scale | THE x + p = q gap, closed |
| g7.ee.combine | 7.EE.A.1 | worked | `form: combined` guard |
| g7.ee.two-step | 7.EE.B.4a | balance-scale | two-op peel; capstone ans < 0 |
| g7.ee.distribute-solve | 7.EE.B.4a | area-model | expand-first vs divide-first across the two reps |

Edges: {exponents, evaluate, add-solve} roots; evaluate →
{write-expression, equivalent}; equivalent → {combine, distribute-solve};
add-solve + prealg.lineq.divide → two-step → distribute-solve. The
two-step edge JOINS the lineq cluster and this slab into one component.

## Machinery this slab forced (now general)

- **Implicit multiplication** (`parseExprLoose`): rendered answers and
  student input write "3x" and "3(x+2)"; the grader and validator now
  parse them (function calls like abs(x) untouched).
- **Open-expression answers**: when an answer renders to an expression
  with free variables ("3n + 5"), `verify:` holds an independently
  authored ALTERNATE FORM and the validator requires symbolic agreement
  by sampling. Grading already worked (sampled equivalence).
- **Form guards** (`answer.form`): symbolic equivalence would accept an
  echo of the stem ("3(x+2)" ≡ "3x+6"), so `expanded` bans parentheses
  and `combined` bans a twice-appearing variable. Syntactic, cheap,
  honest.

## Deferred (in TODO.md)

6.EE.B.8 inequalities (needs an inequality answer shape + region
number-line), 6.EE.C.9 dependent variables (pairs with a future
function-graph widget), 7.EE.B.3 multi-step rational word problems,
factoring items (needs `form: factored`), write-the-EQUATION-from-context.
