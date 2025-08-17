export interface DOMData {
  url: string;
  title: string;
  timestamp: string;
  frames: FrameData[];
} 

export interface FrameData {
  frame_id: number;
  parent_frame_id: number;
  url: string;
  html: string;
  metadata: Record<string, any>;
}