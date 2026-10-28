"""Build the drill-down tree behind the opening section's maps (data/build/budget_tree.json).

The FY2027 adopted budget is split into five pots. Each pot has a "money in" map and a
"money out" map. Every map is a tree of nodes:

    Node = {name, key, value_m, fy, src, children: [Node], offsets: [{name, value_m}]}

children, offsets and src are omitted when null (ruling R11: absent means null), to keep the file small.

Where the numbers come from:

- General Fund. Money in: the 12 categories of Vol. I Table 2 (FY2027), each opened into the
  latest CSV year's accounts. Money out: the nine department slices of the funnel's bar 4
  (FY2027), each opened into the latest CSV year's plain categories and then accounts.
  "All other" opens into the CSV departments that are not among the eight named ones.
- Utilities, Money tied to a purpose, Internal services & other. Both maps come from the
  latest CSV year: money in by revenue type and then account, money out by fund, plain
  category and then account. Spending rows the city's data lists with no fund appear as their
  own box in the Internal services & other money-out map.
- Construction projects. Both maps come from the curated FY2027 CIP: funding sources in,
  departments and their largest projects out.

Rules for every map:

- At most MAX_CHILDREN boxes per level. The 9 largest stay and the rest roll into an
  "Everything else" box, which opens into the rolled boxes (trimmed the same way).
- At most three named levels below a map root ("Everything else" hops do not count).
- A line whose net value is zero or less (a credit, such as budgeted vacancy savings) is not
  drawn as a box. It is listed in its parent's offsets, and the parent's value is the net sum.
- A box opens further only when it is large enough: a fund or department opens into
  categories at FUND_DEPT_CATEGORY_MIN_M, a category into accounts at ACCOUNT_LEVEL_MIN_M, and
  a CSV "Everything else" box into its rolled boxes at EVERYTHING_ELSE_OPEN_MIN_M. Below that
  it is a leaf; its value still counts in full.
- A child smaller than OMIT_BELOW_M either way (after rounding) is not listed by itself. Such
  lines are folded into "Everything else" (or one "Everything else" offset if they net
  negative); only a fold under OMIT_BELOW_M either way is dropped, so a parent's children and
  offsets match its value within OMIT_BELOW_M.
- Blank names never reach the page: a blank department is "Not named in the city's data".
- No box opens into a copy of itself (ruling R12): a node left with exactly one drawn child and
  no offsets takes that child's children (and offsets) as its own, or becomes a leaf.
- Every source is stored once in `sources` and cited by key (s0, s1, ...); a source no box, answer or
  description cites is dropped (ruling R16).
"""
import sys
from collections import defaultdict

from pipeline.categories import expense_category, revenue_category
from pipeline.csv_loader import EXPENSE_TYPES, latest_detail_fy, select_cycle

MAX_CHILDREN = 10            # boxes per level, counting "Everything else"
# Opening thresholds (ruling R9). They exist for size: with every line itemized the tree is
# ~454 KB (3,372 nodes); budget_tree.json must stay under 150,000 bytes (ruling R16).
# Even with no account level at all it is ~178 KB, so the category and Everything-else levels
# need a threshold too.
ACCOUNT_LEVEL_MIN_M = 50.0         # a category opens into accounts only at or above this size
FUND_DEPT_CATEGORY_MIN_M = 15.0    # a fund or department opens into categories at or above this
EVERYTHING_ELSE_OPEN_MIN_M = 50.0  # a CSV "Everything else" box opens at or above this
OMIT_BELOW_M = 0.05                # ruling R10: lines below this either way fold into Everything else
UNMAPPED_GF_REVENUE_MAX_M = 5.0   # ruling R8: above this, stop rather than file it under Other Revenue

FUNNEL_TO_CSV_DEPT = {"Citywide Program Expenditures": "Citywide Expenses"}
ALL_OTHER_DEPT = "All other"
EXCLUDED_GF_DEPT = "Major Revenues"
OTHER_REVENUE_CATEGORY = "Other Revenue"

EVERYTHING_ELSE = "Everything else"
EVERYTHING_ELSE_KEY = "_everything_else"
UNNAMED = "Not named in the city's data"
UNNAMED_KEY = "_unnamed"
NO_FUND = "Not assigned to a fund in the city's data"
NO_FUND_KEY = "_no_fund"
OTHER_PROJECTS = "Other projects"
CIP_REMAINDER_MIN_M = 0.05

CSV_URL = "https://seshat.datasd.org/operating_budget/budget_operating_datasd.csv"

# (id, label, headline field). The internal pot adds two headline fields.
POTS = (
    ("general_fund", "General Fund", "general_fund_m"),
    ("utilities", "Utilities", "enterprise_m"),
    ("purpose", "Money tied to a purpose", "special_revenue_m"),
    ("cip", "Construction projects", "cip_m"),
    ("internal", "Internal services & other", None),
)
CSV_POT_FUND_TYPES = {
    "utilities": ("Enterprise Funds",),
    "purpose": ("Special Revenue Funds",),
    "internal": ("Internal Service Funds", "Capital Project Funds"),
}
GF_FUND_TYPE = "General Fund"
ANSWER_KEYS = ("what", "money_from", "committed_to", "who_decides")


class _Sources:
    """Registry: each distinct Source gets one stable key, s0, s1, ... in first-use order."""

    def __init__(self):
        self.table: dict[str, dict] = {}
        self._keys: dict[tuple, str] = {}

    def __call__(self, src: dict) -> str:
        k = (src["doc"], src.get("page"), src["url"])
        if k not in self._keys:
            key = f"s{len(self._keys)}"
            self._keys[k] = key
            self.table[key] = {"doc": src["doc"], "page": src.get("page"), "url": src["url"]}
        return self._keys[k]


def _m(x: float) -> float:
    return round(x, 3)


def _node(name, key, value, fy, src, children=None, offsets=None) -> dict:
    return {"name": name, "key": key, "value_m": _m(value), "fy": fy, "src": src,
            "children": children, "offsets": offsets}


class _Builder:
    def __init__(self, sources: _Sources, detail_fy: int):
        self.reg = sources
        self.detail_fy = detail_fy
        self.csv_src = sources({
            "doc": f"City of San Diego open data: operating budget CSV, FY{detail_fy} adopted",
            "page": None, "url": CSV_URL})

    # --- shared: offsets and trimming -------------------------------------------------------

    def arrange(self, kids: list[dict], fy: int, curated: bool) -> tuple[list | None, list | None]:
        """Split kids into drawn children (value > 0, largest first, trimmed) and offsets.

        Ruling R10 (amended): kids under OMIT_BELOW_M either way are not listed one by one.
        Their net sum is folded into "Everything else" (added to it and to each nested one on
        the way down, or a new leaf where there is none); a net negative fold is one
        "Everything else" offset; a net fold under OMIT_BELOW_M either way is dropped."""
        tiny = [k for k in kids if abs(k["value_m"]) < OMIT_BELOW_M]
        kids = [k for k in kids if abs(k["value_m"]) >= OMIT_BELOW_M]
        pos = sorted((k for k in kids if k["value_m"] > 0), key=lambda k: (-k["value_m"], k["name"]))
        neg = sorted((k for k in kids if k["value_m"] <= 0), key=lambda k: (k["value_m"], k["name"]))
        folded = 0.0 if curated else sum(k["value_m"] for k in tiny)   # curated rows have 1 decimal
        children, extra = self.trim(pos, fy, curated, folded)
        offsets = [{"name": k["name"], "value_m": k["value_m"]} for k in neg] + (extra or [])
        offsets.sort(key=lambda o: (o["value_m"], o["name"]))
        return (children or None), (offsets or None)

    def trim(self, kids: list[dict], fy: int, curated: bool, folded: float = 0.0) -> tuple[list, list | None]:
        """At most MAX_CHILDREN boxes; the rest roll into a nested "Everything else". Returns
        (children, extra offsets for the owner of these children)."""
        folded = _m(folded)
        leaf = folded >= OMIT_BELOW_M
        if len(kids) <= MAX_CHILDREN - (1 if leaf else 0):
            if leaf:
                return kids + [_node(EVERYTHING_ELSE, EVERYTHING_ELSE_KEY, folded, fy, self.csv_src)], None
            if folded <= -OMIT_BELOW_M:
                return kids, [{"name": EVERYTHING_ELSE, "value_m": folded}]
            return kids, None
        keep, rest = kids[:MAX_CHILDREN - 1], kids[MAX_CHILDREN - 1:]
        listed = sum(k["value_m"] for k in rest)
        extra = None
        if _m(listed + folded) <= 0:   # a credit fold larger than the roll-up: keep it as an offset
            extra = [{"name": EVERYTHING_ELSE, "value_m": folded}]
            folded = 0.0
        total = listed + folded
        src = self._rollup_src(rest, total) if curated else self.csv_src
        ee = _node(EVERYTHING_ELSE, EVERYTHING_ELSE_KEY, total, fy, src)
        if curated or _m(total) >= EVERYTHING_ELSE_OPEN_MIN_M:
            ee["children"], ee["offsets"] = self.trim(rest, fy, curated, folded)
        return keep + [ee], extra

    def _rollup_src(self, rest: list[dict], total: float) -> str:
        first = self.reg.table[rest[0]["src"]]
        parts = " + ".join(f"{k['value_m']:.1f} ({k['name']})" for k in rest)
        return self.reg({"doc": f"our arithmetic: {parts} = {total:.1f}",
                         "page": first["page"], "url": first["url"]})

    # --- CSV-backed levels ------------------------------------------------------------------

    def csv_kids(self, rows: list[dict], levels: list, parent_key: str) -> list[dict]:
        """One node per group of the first level; deeper levels nest inside each node."""
        group_fn, _ = levels[0]
        groups: dict[tuple, list] = defaultdict(list)
        for r in rows:
            groups[group_fn(r, parent_key)].append(r)
        return [self.csv_node(name, key, grows, levels[1:]) for (name, key), grows in groups.items()]

    def csv_node(self, name: str, key: str, rows: list[dict], levels: list) -> dict:
        """A node summing rows; it opens into levels if it is big enough for the first one."""
        node = _node(name, key, sum(r["amount"] for r in rows) / 1e6, self.detail_fy, self.csv_src)
        if levels and node["value_m"] >= levels[0][1]:
            self.expand(node, rows, levels)
        return node

    def expand(self, node: dict, rows: list[dict], levels: list, extra=()) -> dict:
        """Give node children (and offsets) from rows grouped by levels, plus any extra nodes."""
        kids = (self.csv_kids(rows, levels, node["key"]) if rows else []) + list(extra)
        if kids:
            node["children"], node["offsets"] = self.arrange(kids, self.detail_fy, curated=False)
        return node


def _dept_level(r, _parent_key):
    name = r["dept_name"].strip()
    return (name, name) if name else (UNNAMED, UNNAMED_KEY)


def _category_level(r, _parent_key):
    c = expense_category(r)
    return c, c


def _revenue_type_level(r, _parent_key):
    t = revenue_category(r)
    return t, t


def _account_level(r, parent_key):
    return (r["account"].strip() or UNNAMED), parent_key


DEPT = (_dept_level, float("-inf"))
CATEGORY = (_category_level, FUND_DEPT_CATEGORY_MIN_M)
REVENUE_TYPE = (_revenue_type_level, float("-inf"))
ACCOUNT = (_account_level, ACCOUNT_LEVEL_MIN_M)


def _fund_level(fund_label: dict[str, str]):
    def level(r, _parent_key):
        name = fund_label[r["fund_number"]]
        return name, name
    return (level, float("-inf"))


def _fund_labels(fund_numbers, fund_names: dict[str, str]) -> dict[str, str]:
    """Plain fund names; a missing name shows the number, and a shared name gets its number."""
    base = {n: (fund_names.get(n) or "").strip() or f"Fund {n}" for n in fund_numbers}
    counts = defaultdict(int)
    for name in base.values():
        counts[name] += 1
    return {n: (f"{name} ({n})" if counts[name] > 1 else name) for n, name in base.items()}


def _gf_match(m: dict, r: dict) -> bool:
    """Ruling R7: include/exclude match case-insensitively on the account name or account group."""
    if r["account_type"] not in m["types"]:
        return False
    hay = (r["account"].lower(), r["account_group"].lower())

    def hit(s):
        return any(s.lower() in h for h in hay)
    if m["include"] and not hit(m["include"]):
        return False
    if m["exclude"] and hit(m["exclude"]):
        return False
    return True


def _is_expense(r) -> bool:
    return r["account_type"] in EXPENSE_TYPES


def _gf_in(b: _Builder, gf_revenue: dict, rows: list[dict], root_name: str, key: str) -> dict:
    cats = gf_revenue["categories"]
    fy = gf_revenue["fy"]
    buckets: dict[str, list] = defaultdict(list)
    unmapped = []
    for r in rows:
        hits = [c["name"] for c in cats if _gf_match(c["csv"], r)]
        if len(hits) > 1:
            raise ValueError(f"gf_revenue: account {r['account']!r} ({r['account_type']}) matches "
                             f"more than one category: {hits}")
        (buckets[hits[0]] if hits else unmapped).append(r)
    if unmapped:
        if OTHER_REVENUE_CATEGORY not in {c["name"] for c in cats}:
            raise ValueError(f"gf_revenue: no {OTHER_REVENUE_CATEGORY!r} category to hold unmapped rows")
        gross = sum(abs(r["amount"]) for r in unmapped) / 1e6
        if gross >= UNMAPPED_GF_REVENUE_MAX_M:
            by_type = defaultdict(float)
            for r in unmapped:
                by_type[r["account_type"]] += r["amount"] / 1e6
            detail = ", ".join(f"{t} {v:.2f}M" for t, v in sorted(by_type.items()))
            raise ValueError(f"gf_revenue: FY{b.detail_fy} General Fund revenue matching no Table 2 category "
                             f"totals {gross:.2f}M (limit {UNMAPPED_GF_REVENUE_MAX_M}M): {detail}")
    kids = []
    for c in cats:
        fig = c["amount_m"]
        node = _node(c["name"], c["name"], fig["value"], fy, b.reg(fig["source"]))
        extra_rows = unmapped if c["name"] == OTHER_REVENUE_CATEGORY else []
        if fig["value"] >= ACCOUNT_LEVEL_MIN_M or extra_rows:
            b.expand(node, buckets[c["name"]] + extra_rows, [ACCOUNT])
        kids.append(node)
    total = gf_revenue["total_m"]
    root = _node(root_name, key, total["value"], fy, b.reg(total["source"]))
    root["children"], root["offsets"] = b.arrange(kids, fy, curated=True)
    return root


def _gf_out(b: _Builder, headline: dict, funnel: dict, rows: list[dict], root_name: str, key: str) -> dict:
    fy = funnel["fy"]
    by_dept: dict[str, list] = defaultdict(list)
    for r in rows:
        by_dept[r["dept_name"]].append(r)
    named = {FUNNEL_TO_CSV_DEPT.get(x["dept"], x["dept"]) for x in funnel["bar4"] if x["dept"] != ALL_OTHER_DEPT}
    kids = []
    for x in funnel["bar4"]:
        fig = x["amount_m"]
        node = _node(x["dept"], x["dept"], fig["value"], fy, b.reg(fig["source"]))
        if x["dept"] == ALL_OTHER_DEPT:
            b.expand(node, [r for r in rows if r["dept_name"] not in named], [DEPT, CATEGORY])
        else:
            csv_name = FUNNEL_TO_CSV_DEPT.get(x["dept"], x["dept"])
            if not by_dept.get(csv_name):
                print(f"budget_tree: no FY{b.detail_fy} General Fund spending rows for department "
                      f"{csv_name!r}; its box has no detail", file=sys.stderr)
            if fig["value"] >= FUND_DEPT_CATEGORY_MIN_M:
                b.expand(node, by_dept.get(csv_name, []), [CATEGORY, ACCOUNT])
        kids.append(node)
    fig = headline["general_fund_m"]
    root = _node(root_name, key, fig["value"], fy, b.reg(fig["source"]))
    root["children"], root["offsets"] = b.arrange(kids, fy, curated=True)
    return root


def _cip_maps(b: _Builder, cip: dict, label: str, key: str) -> tuple[dict, dict]:
    fy = cip["fy"]
    total = cip["total_m"]
    src_kids = [_node(s["name"], s["name"], s["amount_m"]["value"], fy, b.reg(s["amount_m"]["source"]))
                for s in cip["sources"]]
    root_in = _node(f"{label} money in", key, total["value"], fy, b.reg(total["source"]))
    root_in["children"], root_in["offsets"] = b.arrange(src_kids, fy, curated=True)
    dept_kids = []
    for d in cip["departments"]:
        fig = d["amount_m"]
        node = _node(d["name"], d["name"], fig["value"], fy, b.reg(fig["source"]))
        projects = d.get("projects", [])
        kids = [_node(p["name"], p["name"], p["amount_m"]["value"], fy, b.reg(p["amount_m"]["source"]))
                for p in projects]
        listed = sum(p["amount_m"]["value"] for p in projects)
        rest = round(fig["value"] - listed, 1)
        if rest > CIP_REMAINDER_MIN_M:
            # Ruling R2: the remainder keeps a department's boxes adding up to its total.
            n = len(projects)
            doc = (f"our arithmetic: {fig['value']:.1f} ({d['name']} total) - {listed:.1f} "
                   f"(sum of the {n} listed project{'s' if n != 1 else ''}) = {rest:.1f}")
            kids.append(_node(OTHER_PROJECTS, OTHER_PROJECTS, rest, fy, b.reg({
                "doc": doc, "page": fig["source"].get("page"), "url": fig["source"]["url"]})))
        if not (len(kids) == 1 and kids[0]["name"] == OTHER_PROJECTS):
            if kids:
                node["children"], node["offsets"] = b.arrange(kids, fy, curated=True)
        dept_kids.append(node)
    root_out = _node(f"{label} money out", key, total["value"], fy, b.reg(total["source"]))
    root_out["children"], root_out["offsets"] = b.arrange(dept_kids, fy, curated=True)
    return root_in, root_out


def _detail_rows(rows: list[dict], detail_fy: int) -> list[dict]:
    return [r for r in select_cycle(rows) if r["fy"] == detail_fy]


def _unmatched_summary(unmatched, rows: list[dict], detail_fy: int) -> dict:
    """Rows the loader drops (unknown account), counted for the detail year's chosen cycle."""
    has_adopted = any(r["fy"] == detail_fy and r["cycle"] == "adopted" for r in rows)
    want = "adopted" if has_adopted else ""
    keep = [u for u in (unmatched or []) if u["fy"] == detail_fy and u["cycle"] == want]
    return {"rows": len(keep), "value_m": _m(sum(u["amount"] for u in keep) / 1e6)}


DETAIL_FY_PLACEHOLDER = "{detail_fy}"


def _fill(text: str, detail_fy: int) -> str:
    """Copy may say {detail_fy} where the CSV detail year belongs (e.g. "FY{detail_fy}")."""
    return text.replace(DETAIL_FY_PLACEHOLDER, str(detail_fy))


def _no_nulls(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def _descs(labels: dict, reg: _Sources, detail_fy: int) -> dict:
    """descs entries omit a null src or link (absent means null)."""
    out = {}
    for key, c in (labels.get("categories") or {}).items():
        out[key] = _no_nulls({"text": _fill(c["text"], detail_fy), "link": c.get("link")})
    for key, n in (labels.get("nodes") or {}).items():
        out[key] = _no_nulls({"text": _fill(n["text"], detail_fy),
                              "src": reg(n["source"]) if n.get("source") else None,
                              "link": n.get("link")})
    return out


def _answers(labels: dict, pot_id: str, reg: _Sources, detail_fy: int):
    a = (labels.get("pots") or {}).get(pot_id)
    if not a:
        return None
    return {k: {"text": _fill(a[k]["text"], detail_fy), "src": reg(a[k]["source"])} for k in ANSWER_KEYS}


NULLABLE_NODE_FIELDS = ("children", "offsets", "src")


def _collapse_single(node: dict) -> dict:
    """Ruling R12: a box marked as opening must open into more than a copy of itself.

    While a node has exactly one drawn child and no offsets: if that child has children, they
    (and the child's offsets) move up to the node; otherwise the node becomes a leaf. Then the
    same rule runs on each remaining child. The node keeps its own name, value, year and source,
    so a same-year parent still matches its (hoisted) children within the existing tolerance."""
    while len(node.get("children") or []) == 1 and not node.get("offsets"):
        only = node["children"][0]
        node["children"] = only.get("children") or None
        node["offsets"] = only.get("offsets") or None
    for c in node.get("children") or []:
        _collapse_single(c)
    return node


def _compact(node: dict) -> dict:
    """Ruling R11: a node omits children, offsets or src when null (absent means null)."""
    for f in NULLABLE_NODE_FIELDS:
        if node.get(f) is None:
            node.pop(f, None)
    for c in node.get("children") or []:
        _compact(c)
    return node


def _prune_sources(tree: dict) -> dict:
    """Ruling R16: drop sources registered for boxes that were later discarded (a collapsed single child, R12) and
    renumber the rest s0, s1, ... in their original first-use order, so every stored source is cited."""
    used = set()

    def nodes(n):
        yield n
        for c in n.get("children") or []:
            yield from nodes(c)
    for p in tree["pots"]:
        used.add(p["src"])
        used |= {a["src"] for a in (p.get("answers") or {}).values()}
        for side in ("in", "out"):
            used |= {n["src"] for n in nodes(p[side]) if n.get("src")}
    used |= {d["src"] for d in tree["descs"].values() if d.get("src")}
    keep = [k for k in tree["sources"] if k in used]  # dict order is registration order
    new = {k: f"s{i}" for i, k in enumerate(keep)}
    tree["sources"] = {new[k]: tree["sources"][k] for k in keep}
    for p in tree["pots"]:
        p["src"] = new[p["src"]]
        for a in (p.get("answers") or {}).values():
            a["src"] = new[a["src"]]
        for side in ("in", "out"):
            for n in nodes(p[side]):
                if n.get("src"):
                    n["src"] = new[n["src"]]
    for d in tree["descs"].values():
        if d.get("src"):
            d["src"] = new[d["src"]]
    return tree


def _pot_value(headline: dict, field: str | None, reg: _Sources) -> tuple[float, str]:
    if field:
        fig = headline[field]
        return fig["value"], reg(fig["source"])
    isf, cpf = headline["internal_service_m"], headline["capital_project_m"]
    total = round(isf["value"] + cpf["value"], 1)
    return total, reg({
        "doc": (f"our arithmetic: {isf['value']:.1f} (Internal Service Funds) + "
                f"{cpf['value']:.1f} (Capital Project Funds) = {total:.1f}"),
        "page": isf["source"].get("page"), "url": isf["source"]["url"]})


def build_budget_tree(rows, fund_names: dict[str, str], headline, funnel, gf_revenue, cip, labels,
                      unmatched: list[dict] | None = None) -> dict:
    """Assemble budget_tree.json (contract in docs/data-contracts.md)."""
    detail_fy = latest_detail_fy(rows)
    detail = _detail_rows(rows, detail_fy)
    reg = _Sources()
    b = _Builder(reg, detail_fy)

    known = {GF_FUND_TYPE, ""} | {t for ts in CSV_POT_FUND_TYPES.values() for t in ts}
    unknown = sorted({r["fund_type"] for r in detail} - known)
    if unknown:
        raise ValueError(f"budget_tree: FY{detail_fy} rows have fund types no pot holds: {unknown}")

    used_funds = {r["fund_number"] for r in detail if r["fund_type"] not in (GF_FUND_TYPE, "")}
    fund_label = _fund_labels(used_funds, fund_names)
    fund = _fund_level(fund_label)

    pots = []
    for pot_id, label, field in POTS:
        value, src = _pot_value(headline, field, reg)
        in_name, out_name = f"{label} money in", f"{label} money out"
        if pot_id == "general_fund":
            gf = [r for r in detail if r["fund_type"] == GF_FUND_TYPE]
            root_in = _gf_in(b, gf_revenue, [r for r in gf if not _is_expense(r)], in_name, pot_id)
            root_out = _gf_out(b, headline, funnel,
                               [r for r in gf if _is_expense(r) and r["dept_name"] != EXCLUDED_GF_DEPT],
                               out_name, pot_id)
        elif pot_id == "cip":
            root_in, root_out = _cip_maps(b, cip, label, pot_id)
        else:
            types = CSV_POT_FUND_TYPES[pot_id]
            mine = [r for r in detail if r["fund_type"] in types]
            rev = [r for r in mine if not _is_expense(r)]
            exp = [r for r in mine if _is_expense(r)]
            extra_in, extra_out = [], []
            if pot_id == "internal":
                no_fund = [r for r in detail if r["fund_type"] == ""]
                nf_exp = [r for r in no_fund if _is_expense(r)]
                nf_rev = [r for r in no_fund if not _is_expense(r)]
                if nf_exp:
                    extra_out.append(b.csv_node(NO_FUND, NO_FUND_KEY, nf_exp, [CATEGORY, ACCOUNT]))
                    exp = exp + nf_exp
                if nf_rev:
                    extra_in.append(b.csv_node(NO_FUND, NO_FUND_KEY, nf_rev, [REVENUE_TYPE, ACCOUNT]))
                    rev = rev + nf_rev
            root_in = b.expand(b.csv_node(in_name, pot_id, rev, []),
                               [r for r in rev if r["fund_type"]], [REVENUE_TYPE, ACCOUNT], extra_in)
            root_out = b.expand(b.csv_node(out_name, pot_id, exp, []),
                                [r for r in exp if r["fund_type"]], [fund, CATEGORY, ACCOUNT], extra_out)
        pots.append({"id": pot_id, "label": label, "value_m": value, "src": src,
                     "answers": _answers(labels, pot_id, reg, detail_fy),
                     "in": _compact(_collapse_single(root_in)), "out": _compact(_collapse_single(root_out))})

    nf_exp = [r for r in detail if r["fund_type"] == "" and _is_expense(r)]
    unassigned = None
    if nf_exp:
        depts = sorted({r["dept_name"].strip() or UNNAMED for r in nf_exp})
        unassigned = {"value_m": _m(sum(r["amount"] for r in nf_exp) / 1e6), "dept_name": "; ".join(depts)}

    return _prune_sources({
        "bar_fy": headline["fy"],
        "detail_fy": detail_fy,
        "total_m": headline["total_budget_m"],
        "sources": reg.table,
        "descs": _descs(labels, reg, detail_fy),
        "unassigned": unassigned,
        "unmatched": _unmatched_summary(unmatched, rows, detail_fy),
        "pots": pots,
    })
