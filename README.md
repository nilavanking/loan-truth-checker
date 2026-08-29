# Loan Truth Checker

Independent vehicle-loan audit and multi-financier comparison tool. It helps a borrower look beyond an advertised interest rate or low EMI and understand the actual cost, disclosures and signing risks of a loan offer.

## Main capabilities

- Reducing-balance and flat-rate EMI calculations
- Monthly and yearly amortisation schedules
- Flat-rate to equivalent reducing-rate comparison
- True APR based on actual cash flows, fees and deductions
- Net-disbursement and financed-charge audit
- KFS completeness and mathematical cross-checks
- Prepayment and foreclosure contract checks
- Approval Gate with clear reasons and lender questions
- Side-by-side comparison of two to five financier quotations
- Actual-offer and normalized comparison modes
- Cost, transparency, flexibility and overall-loan awards
- Negotiation suggestions derived only from entered quotations

Loan figures are calculated locally in the browser. The application is an independent educational and audit tool and is not affiliated with or endorsed by RBI, any bank, NBFC or lender.

## Development

Requirements: Node.js 22 or later.

```bash
npm ci
npm run dev
```

## Validation

```bash
npm run lint
npm test
```

The test suite covers standard reducing loans, flat-rate normalization, fees deducted or financed, insurance bundling, inconsistent lender figures, missing disclosures, different amounts and tenures, and multi-offer rankings.

## Netlify

The repository includes `netlify.toml`. Netlify should use:

- Production branch: `main`
- Build command: `npm run build:netlify`
- Publish directory: `.next`

Netlify automatically provides its Next.js runtime during deployment.

## Privacy

Quotation inputs are stored locally in the user's browser. Do not add analytics that collect loan amounts, KFS information or personal financial data without explicit consent and a privacy review.
