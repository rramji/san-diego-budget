"""How the page sorts city spending into plain categories.

The city's budget data labels every dollar with an account type, an account
group and an account name. Those labels are written for accountants. This page
re-sorts spending into 14 plain categories. The same rule is applied to every
spending line on the page, so the categories always add up to the total.

Revenue is not re-sorted. Money coming in keeps the city's own account type
(for example "Property Tax Revenue" or "Sales Taxes").

The rule is applied in this order, and the first match wins:

1. Overtime. Any account whose name starts with "Overtime" counts as Overtime,
   wherever the city files it.
2. Vehicles. Five accounts for running and buying city vehicles (vehicle
   rental charges from the city's fleet, fleet fuel, additional vehicle
   purchases and vehicle capital purchases) count as Vehicles, even though the
   city files them under other groups such as contracts, energy or capital
   spending.
3. Otherwise the city's account group decides:
   - Salaries & other pay: Salaries, Special Pays (for example shift pay) and
     Other Personnel Expenditures. The last group includes the vacancy
     savings credit, a negative number the city subtracts because it expects
     some jobs to sit empty.
   - Pension payment: Retirement ADC (the yearly payment the city must make
     into its pension fund, called the actuarially determined contribution)
     and Employee Offset Savings.
   - Workers' comp: Workers' Compensation.
   - Health & other benefits: Flexible Benefits, Medicare, Other
     Post-Employment Benefits, Retiree Medical Trust, Long-Term Disability,
     Unemployment Insurance, Supplemental Pension Savings Plan, Retirement 401
     Plan, Retirement DROP and Risk Management Administration.
   - Contracts & services: External Contracts & Services and Internal
     Contracts & Services (one city department paying another for work).
   - Supplies: Supplies.
   - Energy & utilities: Energy and Utilities.
   - Information technology: IT Group 1, 2 and 3.
   - Debt payments: Debt.
   - Transfers to other funds: Transfers Out.
   - Equipment & construction: Capital Expenditures.
4. Other costs. Any account group not listed above, including groups the city
   adds later. Nothing is dropped: it lands here so the total still adds up.
   (The name "Everything else" is kept for a different purpose, the roll-up of
   small boxes on the maps.)

Category sizes come from our sorting of the city's labels. The city does not
publish these 14 categories itself.
"""

EXPENSE_CATEGORIES: tuple[str, ...] = (
    "Salaries & other pay",
    "Overtime",
    "Pension payment",
    "Workers' comp",
    "Health & other benefits",
    "Vehicles",
    "Contracts & services",
    "Supplies",
    "Energy & utilities",
    "Information technology",
    "Debt payments",
    "Transfers to other funds",
    "Equipment & construction",
    "Other costs",
)

VEHICLE_ACCOUNTS = {
    "Equipment Rental - Motive Assign",
    "Equipment Rental - Motive Usage",
    "Fleet Fuel (Non-Discretionary)",
    "Fleet Services Additional Vehicle Purchases",
    "Cap Exp-Vehicles",
}

_HEALTH_AND_BENEFITS = (
    "Flexible Benefits",
    "Medicare",
    "Other Post-Employment Benefits",
    "Retiree Medical Trust",
    "Long-Term Disability",
    "Unemployment Insurance",
    "Supplemental Pension Savings Plan",
    "Retirement 401 Plan",
    "Retirement DROP",
    "Risk Management Administration",
)

GROUP_CATEGORY: dict[str, str] = {
    "Salaries": "Salaries & other pay",
    "Special Pays": "Salaries & other pay",
    "Other Personnel Expenditures": "Salaries & other pay",
    "Retirement ADC": "Pension payment",
    "Employee Offset Savings": "Pension payment",
    "Workers' Compensation": "Workers' comp",
    **{g: "Health & other benefits" for g in _HEALTH_AND_BENEFITS},
    "External Contracts & Services": "Contracts & services",
    "Internal Contracts & Services": "Contracts & services",
    "Supplies": "Supplies",
    "Energy and Utilities": "Energy & utilities",
    "IT Group 1": "Information technology",
    "IT Group 2": "Information technology",
    "IT Group 3": "Information technology",
    "Debt": "Debt payments",
    "Transfers Out": "Transfers to other funds",
    "Capital Expenditures": "Equipment & construction",
}


def expense_category(row: dict) -> str:
    """Return the plain category for one spending row (see module docstring)."""
    account = row["account"]
    if account.startswith("Overtime"):
        return "Overtime"
    if account in VEHICLE_ACCOUNTS:
        return "Vehicles"
    return GROUP_CATEGORY.get(row["account_group"], "Other costs")


def revenue_category(row: dict) -> str:
    """Revenue keeps the city's own account type."""
    return row["account_type"]
