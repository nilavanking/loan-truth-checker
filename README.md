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
- Dated cash-flow IRR/XIRR, advance-EMI and broken-period models
- Two-option part-prepayment and settlement-date foreclosure estimates
- Separate Truth Score and Evidence Confidence
- Installable offline-capable PWA

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
npm run typecheck
npm test
npm run test:regulatory
npm run build:netlify
```

The test suite covers standard reducing loans, flat-rate normalization, IRR/XIRR, fee treatments, advance EMI, broken-period interest, prepayment, foreclosure, floating resets, insurance bundling, inconsistent lender figures, missing disclosures, different amounts and tenures, multi-offer rankings and RBI source metadata.

Financial formulas live in `loan-engine/`. UI modules should consume this shared engine instead of introducing screen-specific EMI, APR or settlement formulas.

## Netlify

The repository includes `netlify.toml`. Netlify should use:

- Production branch: `main`
- Build command: `npm run build:netlify`
- Publish directory: `.next`

Netlify automatically provides its Next.js runtime during deployment.

## Privacy

Quotation inputs are stored locally in the user's browser. Do not add analytics that collect loan amounts, KFS information or personal financial data without explicit consent and a privacy review.
