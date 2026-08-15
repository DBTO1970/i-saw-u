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
          photo_hash: string | null;
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
          photo_hash?: string | null;
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
          photo_hash?: string | null;
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
      shows: {
        Row: {
          id: string;
          artist_name: string;
          provider: 'phishnet' | 'elgoose' | 'relisten' | 'bmfsdb' | 'kglw' | 'setlistfm';
          external_show_id: string;
          show_date: string;
          venue_name: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          artist_name: string;
          provider: 'phishnet' | 'elgoose' | 'relisten' | 'bmfsdb' | 'kglw' | 'setlistfm';
          external_show_id: string;
          show_date: string;
          venue_name?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          artist_name?: string;
          provider?: 'phishnet' | 'elgoose' | 'relisten' | 'bmfsdb' | 'kglw' | 'setlistfm';
          external_show_id?: string;
          show_date?: string;
          venue_name?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      setlists: {
        Row: {
          id: string;
          show_id: string;
          set_name: string;
          set_type: 'set_1' | 'set_2' | 'encore' | 'other';
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          show_id: string;
          set_name: string;
          set_type?: 'set_1' | 'set_2' | 'encore' | 'other';
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          show_id?: string;
          set_name?: string;
          set_type?: 'set_1' | 'set_2' | 'encore' | 'other';
          position?: number;
          created_at?: string;
        };
      };
      songs: {
        Row: {
          id: string;
          setlist_id: string;
          title: string;
          position: number;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          setlist_id: string;
          title: string;
          position: number;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          setlist_id?: string;
          title?: string;
          position?: number;
          duration_seconds?: number | null;
          created_at?: string;
        };
      };
    };
    Enums: {
      show_provider: 'phishnet' | 'elgoose' | 'relisten' | 'bmfsdb' | 'kglw' | 'setlistfm';
      set_type: 'set_1' | 'set_2' | 'encore' | 'other';
    };
  };
}
