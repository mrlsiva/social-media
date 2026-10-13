import { environment } from '../../../environments/environment';

/** Business details used across the Privacy Policy, Terms and Data Deletion pages. */
export const LEGAL = {
  product: environment.appName,
  company: 'Sling Groups',
  website: 'https://social.slinggroups.in',
  email: 'support@slinggroups.in',
  address: 'India',
  jurisdiction: 'India',
  effectiveDate: '13 October 2026',
  /** Days within which a deletion request is completed. */
  deletionDays: 30,
};
