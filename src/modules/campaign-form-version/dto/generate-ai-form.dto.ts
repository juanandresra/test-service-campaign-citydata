import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export interface AiAttachedDocumentDto {
  name: string;
  content: string;
  type?: string;
}

export interface AiChatMessageDto {
  role: 'user' | 'assistant';
  content: string;
}

export class GenerateAiFormDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsOptional()
  currentForm?: any;

  @IsArray()
  @IsOptional()
  documents?: AiAttachedDocumentDto[];

  @IsArray()
  @IsOptional()
  history?: AiChatMessageDto[];

  @IsString()
  @IsOptional()
  language?: string;
}
