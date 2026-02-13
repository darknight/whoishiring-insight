export interface JobPosting {
  id: string;
  issueNumber: number;
  commentId: number;
  yearMonth: string;
  author: string;
  rawContent: string;
  company: string;
  companyType?: string;
  positions: Position[];
  location: string[];
  isRemote: boolean;
  isOverseas: boolean;
  salaryRange?: string;
  techStack: string[];
  experienceReq?: string;
  educationReq?: string;
  contact?: string;
}

export interface Position {
  title: string;
  category: string;
}

export interface MonthlyStats {
  yearMonth: string;
  totalPostings: number;
  byCity: Record<string, number>;
  byTechStack: Record<string, number>;
  byCategory: Record<string, number>;
  byCompanyType: Record<string, number>;
  remoteCount: number;
  overseasCount: number;
}
