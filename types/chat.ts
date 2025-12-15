export interface Medicine {
  name: string;
  ingredients: string;
  effects: string;
  dosage: string;
  cautions: string;
  imageUrl?: string | null;
}

export interface ApiResponse {
  greeting?: string;
  medicines?: Medicine[];
  additionalAdvice?: string;
  needHospital?: boolean;
  hospitalReason?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  apiResponse?: ApiResponse;  // API에서 받은 구조화된 데이터
  timestamp: Date;
}