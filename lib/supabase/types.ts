export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          terms_accepted_at: string | null;
          terms_accepted_version: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          terms_accepted_at?: string | null;
          terms_accepted_version?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          terms_accepted_at?: string | null;
          terms_accepted_version?: string | null;
          updated_at?: string;
        };
      };
      photos: {
        Row: {
          id: string;
          user_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          date_taken: string | null;
          time_taken: string | null;
          gps_latitude: number | null;
          gps_longitude: number | null;
          raw_exif: Json;
          matched_show_date: string | null;
          show_start_time: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type?: string;
          date_taken?: string | null;
          time_taken?: string | null;
          gps_latitude?: number | null;
          gps_longitude?: number | null;
          raw_exif?: Json;
          matched_show_date?: string | null;
          show_start_time?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          storage_path?: string;
          file_name?: string;
          file_size?: number;
          mime_type?: string;
          date_taken?: string | null;
          time_taken?: string | null;
          gps_latitude?: number | null;
          gps_longitude?: number | null;
          raw_exif?: Json;
          matched_show_date?: string | null;
          show_start_time?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
      };
      saved_shows: {
        Row: {
          id: string;
          user_id: string;
          show_date: string;
          venue_name: string | null;
          location: string | null;
          show_data: Json;
          user_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          show_date: string;
          venue_name?: string | null;
          location?: string | null;
          show_data?: Json;
          user_notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          show_date?: string;
          venue_name?: string | null;
          location?: string | null;
          show_data?: Json;
          user_notes?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
