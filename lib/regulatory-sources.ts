export type RuleStatus = "IN FORCE" | "UPCOMING" | "DRAFT" | "GUIDANCE" | "LENDER POLICY";

export type RegulatorySource = {
  id: string;
  title: string;
  authority: string;
  reference: string;
  publicationDate: string;
  effectiveDate: string;
  status: RuleStatus;
  applicability: string;
  source: string;
  lastChecked: string;
  explanation: string;
  superseded: boolean;
};

export const REGULATORY_SOURCES: RegulatorySource[] = [
  {
    id: "rbi-kfs-2024",
    title: "Key Facts Statement (KFS) for Loans & Advances",
    authority: "Reserve Bank of India",
    reference: "RBI/2024-25/18 · DOR.STR.REC.13/13.03.00/2024-25",
    publicationDate: "15 Apr 2024",
    effectiveDate: "01 Oct 2024",
    status: "IN FORCE",
    applicability: "New retail and MSME term loans by the regulated entities identified in the circular, subject to its scope and exclusions.",
    source: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12663&Mode=0",
    lastChecked: "29 Aug 2026",
    explanation: "The KFS circular requires standardised disclosure including APR and the amortisation schedule for covered loans.",
    superseded: false,
  },
  {
    id: "rbi-prepayment-2025",
    title: "Reserve Bank of India (Pre-payment Charges on Loans) Directions, 2025",
    authority: "Reserve Bank of India",
    reference: "RBI/2025-26/64 · DoR.MCS.REC.38/01.01.001/2025-26",
    publicationDate: "02 Jul 2025",
    effectiveDate: "01 Jan 2026",
    status: "IN FORCE",
    applicability: "Loans and advances sanctioned or renewed on or after 1 January 2026; the result depends on rate, purpose, borrower and regulated-entity category.",
    source: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12878&Mode=0",
    lastChecked: "29 Aug 2026",
    explanation: "The directions restrict pre-payment charges for specified floating-rate loans; they do not make every loan charge-free.",
    superseded: false,
  },
  {
    id: "lender-contract",
    title: "Individual lender fees and foreclosure terms",
    authority: "The selected lender",
    reference: "Contract-specific",
    publicationDate: "Varies",
    effectiveDate: "Contract-specific",
    status: "LENDER POLICY",
    applicability: "The specific signed loan contract, subject to applicable law and regulation.",
    source: "Use the lender's current KFS, sanction letter and agreement",
    lastChecked: "At signing",
    explanation: "A lender policy is not an RBI rule and must be checked against the applicable regulation and signed contract.",
    superseded: false,
  },
];
