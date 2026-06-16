export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_aliases: {
        Row: {
          canonical_name: string | null
          course_short: string | null
          created_at: string
          id: string
          preferred_display_name: string | null
        }
        Insert: {
          canonical_name?: string | null
          course_short?: string | null
          created_at?: string
          id?: string
          preferred_display_name?: string | null
        }
        Update: {
          canonical_name?: string | null
          course_short?: string | null
          created_at?: string
          id?: string
          preferred_display_name?: string | null
        }
        Relationships: []
      }
      banked_questions: {
        Row: {
          ai_confidence_score: number | null
          answer_a: string | null
          answer_b: string | null
          answer_c: string | null
          answer_d: string | null
          answer_e: string | null
          asset_id: string | null
          correct_answer: string | null
          created_at: string
          difficulty: number | null
          id: string
          question_text: string | null
          question_type: string | null
          rating: number | null
          rejection_notes: string | null
          review_status: string | null
          short_explanation: string | null
          teaching_asset_id: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          answer_a?: string | null
          answer_b?: string | null
          answer_c?: string | null
          answer_d?: string | null
          answer_e?: string | null
          asset_id?: string | null
          correct_answer?: string | null
          created_at?: string
          difficulty?: number | null
          id?: string
          question_text?: string | null
          question_type?: string | null
          rating?: number | null
          rejection_notes?: string | null
          review_status?: string | null
          short_explanation?: string | null
          teaching_asset_id?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          answer_a?: string | null
          answer_b?: string | null
          answer_c?: string | null
          answer_d?: string | null
          answer_e?: string | null
          asset_id?: string | null
          correct_answer?: string | null
          created_at?: string
          difficulty?: number | null
          id?: string
          question_text?: string | null
          question_type?: string | null
          rating?: number | null
          rejection_notes?: string | null
          review_status?: string | null
          short_explanation?: string | null
          teaching_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banked_questions_teaching_asset_id_fkey"
            columns: ["teaching_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_course_availability: {
        Row: {
          campus_id: string
          course_family: string
          created_at: string
          id: string
          notes: string | null
          requires_syllabus_review: boolean
          textbook_match_status: string
          tutoring_availability: string | null
          updated_at: string
        }
        Insert: {
          campus_id: string
          course_family: string
          created_at?: string
          id?: string
          notes?: string | null
          requires_syllabus_review?: boolean
          textbook_match_status?: string
          tutoring_availability?: string | null
          updated_at?: string
        }
        Update: {
          campus_id?: string
          course_family?: string
          created_at?: string
          id?: string
          notes?: string | null
          requires_syllabus_review?: boolean
          textbook_match_status?: string
          tutoring_availability?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_course_availability_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_course_sections: {
        Row: {
          campus_id: string
          confidence: string | null
          course_code: string | null
          course_family: string | null
          course_title: string | null
          created_at: string
          enrollment_capacity: number | null
          enrollment_current: number | null
          id: string
          instructor_email: string | null
          instructor_name: string | null
          location: string | null
          meeting_days: string | null
          meeting_time: string | null
          raw_payload: Json | null
          section_number: string | null
          source_url: string | null
          term: string | null
          updated_at: string
          waitlist_count: number | null
        }
        Insert: {
          campus_id: string
          confidence?: string | null
          course_code?: string | null
          course_family?: string | null
          course_title?: string | null
          created_at?: string
          enrollment_capacity?: number | null
          enrollment_current?: number | null
          id?: string
          instructor_email?: string | null
          instructor_name?: string | null
          location?: string | null
          meeting_days?: string | null
          meeting_time?: string | null
          raw_payload?: Json | null
          section_number?: string | null
          source_url?: string | null
          term?: string | null
          updated_at?: string
          waitlist_count?: number | null
        }
        Update: {
          campus_id?: string
          confidence?: string | null
          course_code?: string | null
          course_family?: string | null
          course_title?: string | null
          created_at?: string
          enrollment_capacity?: number | null
          enrollment_current?: number | null
          id?: string
          instructor_email?: string | null
          instructor_name?: string | null
          location?: string | null
          meeting_days?: string | null
          meeting_time?: string | null
          raw_payload?: Json | null
          section_number?: string | null
          source_url?: string | null
          term?: string | null
          updated_at?: string
          waitlist_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_course_sections_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_courses: {
        Row: {
          campus_id: string | null
          course_id: string | null
          course_match_confidence: number | null
          course_match_notes: string | null
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          local_course_code: string | null
          local_course_name: string | null
          override_chapter_price_cents: number | null
          override_semester_price_cents: number | null
          source: string | null
        }
        Insert: {
          campus_id?: string | null
          course_id?: string | null
          course_match_confidence?: number | null
          course_match_notes?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          local_course_code?: string | null
          local_course_name?: string | null
          override_chapter_price_cents?: number | null
          override_semester_price_cents?: number | null
          source?: string | null
        }
        Update: {
          campus_id?: string | null
          course_id?: string | null
          course_match_confidence?: number | null
          course_match_notes?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          local_course_code?: string | null
          local_course_name?: string | null
          override_chapter_price_cents?: number | null
          override_semester_price_cents?: number | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_courses_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_intelligence: {
        Row: {
          adoption_count_intermediate: number | null
          adoption_count_intro: number | null
          adoption_count_total: number | null
          adoption_rank_intermediate: number | null
          adoption_rank_intro: number | null
          adoption_sources: Json | null
          adoption_tracks: Json | null
          ai_opportunity_notes: string | null
          ai_risk_notes: string | null
          ai_summary: string | null
          bap_presence_score: number | null
          best_contact_type: string | null
          campus_id: string | null
          campus_name: string | null
          city: string | null
          content_priority_score: number | null
          conversion_signal_score: number | null
          country: string | null
          country_code: string | null
          created_at: string
          existing_paid_signup_count: number | null
          existing_signup_count: number | null
          greek_presence_score: number | null
          id: string
          institution_name: string | null
          institution_type: string | null
          international: boolean | null
          is_high_value_market: boolean | null
          is_international_experimental: boolean | null
          is_target_market: boolean | null
          landing_page_priority_score: number | null
          market_priority: string | null
          market_region: string | null
          metadata: Json | null
          outreach_notes: string | null
          outreach_readiness_score: number | null
          outreach_status: string | null
          priority_score: number | null
          priority_tier: string | null
          professor_signal_score: number | null
          raw_source_json: Json | null
          reddit_accounting_mentions: number | null
          reddit_confidence: number | null
          reddit_mentions: number | null
          region: string | null
          seo_priority_score: number | null
          social_signal_score: number | null
          source_raw_count: number | null
          source_raw_location: string | null
          source_raw_name: string | null
          source_raw_rank: number | null
          state: string | null
          tam_confidence_label: string | null
          tam_score: number | null
          tam_tier: string | null
          tam_total_base: number | null
          updated_at: string
          warm_connection_notes: string | null
        }
        Insert: {
          adoption_count_intermediate?: number | null
          adoption_count_intro?: number | null
          adoption_count_total?: number | null
          adoption_rank_intermediate?: number | null
          adoption_rank_intro?: number | null
          adoption_sources?: Json | null
          adoption_tracks?: Json | null
          ai_opportunity_notes?: string | null
          ai_risk_notes?: string | null
          ai_summary?: string | null
          bap_presence_score?: number | null
          best_contact_type?: string | null
          campus_id?: string | null
          campus_name?: string | null
          city?: string | null
          content_priority_score?: number | null
          conversion_signal_score?: number | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          existing_paid_signup_count?: number | null
          existing_signup_count?: number | null
          greek_presence_score?: number | null
          id?: string
          institution_name?: string | null
          institution_type?: string | null
          international?: boolean | null
          is_high_value_market?: boolean | null
          is_international_experimental?: boolean | null
          is_target_market?: boolean | null
          landing_page_priority_score?: number | null
          market_priority?: string | null
          market_region?: string | null
          metadata?: Json | null
          outreach_notes?: string | null
          outreach_readiness_score?: number | null
          outreach_status?: string | null
          priority_score?: number | null
          priority_tier?: string | null
          professor_signal_score?: number | null
          raw_source_json?: Json | null
          reddit_accounting_mentions?: number | null
          reddit_confidence?: number | null
          reddit_mentions?: number | null
          region?: string | null
          seo_priority_score?: number | null
          social_signal_score?: number | null
          source_raw_count?: number | null
          source_raw_location?: string | null
          source_raw_name?: string | null
          source_raw_rank?: number | null
          state?: string | null
          tam_confidence_label?: string | null
          tam_score?: number | null
          tam_tier?: string | null
          tam_total_base?: number | null
          updated_at?: string
          warm_connection_notes?: string | null
        }
        Update: {
          adoption_count_intermediate?: number | null
          adoption_count_intro?: number | null
          adoption_count_total?: number | null
          adoption_rank_intermediate?: number | null
          adoption_rank_intro?: number | null
          adoption_sources?: Json | null
          adoption_tracks?: Json | null
          ai_opportunity_notes?: string | null
          ai_risk_notes?: string | null
          ai_summary?: string | null
          bap_presence_score?: number | null
          best_contact_type?: string | null
          campus_id?: string | null
          campus_name?: string | null
          city?: string | null
          content_priority_score?: number | null
          conversion_signal_score?: number | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          existing_paid_signup_count?: number | null
          existing_signup_count?: number | null
          greek_presence_score?: number | null
          id?: string
          institution_name?: string | null
          institution_type?: string | null
          international?: boolean | null
          is_high_value_market?: boolean | null
          is_international_experimental?: boolean | null
          is_target_market?: boolean | null
          landing_page_priority_score?: number | null
          market_priority?: string | null
          market_region?: string | null
          metadata?: Json | null
          outreach_notes?: string | null
          outreach_readiness_score?: number | null
          outreach_status?: string | null
          priority_score?: number | null
          priority_tier?: string | null
          professor_signal_score?: number | null
          raw_source_json?: Json | null
          reddit_accounting_mentions?: number | null
          reddit_confidence?: number | null
          reddit_mentions?: number | null
          region?: string | null
          seo_priority_score?: number | null
          social_signal_score?: number | null
          source_raw_count?: number | null
          source_raw_location?: string | null
          source_raw_name?: string | null
          source_raw_rank?: number | null
          state?: string | null
          tam_confidence_label?: string | null
          tam_score?: number | null
          tam_tier?: string | null
          tam_total_base?: number | null
          updated_at?: string
          warm_connection_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_intelligence_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_landing_pages: {
        Row: {
          booking_link: string | null
          color_review_status: string | null
          course_codes: string[] | null
          created_at: string
          fallback_to_default_colors: boolean | null
          id: string
          mascot: string | null
          notes: string | null
          primary_color: string | null
          school_name: string | null
          secondary_color: string | null
          slug: string | null
          status: string | null
          updated_at: string
          use_school_colors: boolean | null
        }
        Insert: {
          booking_link?: string | null
          color_review_status?: string | null
          course_codes?: string[] | null
          created_at?: string
          fallback_to_default_colors?: boolean | null
          id?: string
          mascot?: string | null
          notes?: string | null
          primary_color?: string | null
          school_name?: string | null
          secondary_color?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string
          use_school_colors?: boolean | null
        }
        Update: {
          booking_link?: string | null
          color_review_status?: string | null
          course_codes?: string[] | null
          created_at?: string
          fallback_to_default_colors?: boolean | null
          id?: string
          mascot?: string | null
          notes?: string | null
          primary_color?: string | null
          school_name?: string | null
          secondary_color?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string
          use_school_colors?: boolean | null
        }
        Relationships: []
      }
      campus_lead_suggestions: {
        Row: {
          archive_label: string | null
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          campus_id: string
          confidence: number | null
          courses_found: Json | null
          created_at: string
          department: string | null
          email: string | null
          first_name: string | null
          id: string
          is_cpa: boolean
          is_phd: boolean
          last_name: string | null
          lead_type: string
          notes: string | null
          raw_payload: Json | null
          source_url: string | null
          status: string
          teaches_intermediate_1: boolean | null
          teaches_intermediate_2: boolean | null
          teaches_intro_1: boolean | null
          teaches_intro_2: boolean | null
          teaching_evidence_notes: string | null
          teaching_evidence_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          archive_label?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          campus_id: string
          confidence?: number | null
          courses_found?: Json | null
          created_at?: string
          department?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_cpa?: boolean
          is_phd?: boolean
          last_name?: string | null
          lead_type?: string
          notes?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          status?: string
          teaches_intermediate_1?: boolean | null
          teaches_intermediate_2?: boolean | null
          teaches_intro_1?: boolean | null
          teaches_intro_2?: boolean | null
          teaching_evidence_notes?: string | null
          teaching_evidence_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          archive_label?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          campus_id?: string
          confidence?: number | null
          courses_found?: Json | null
          created_at?: string
          department?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_cpa?: boolean
          is_phd?: boolean
          last_name?: string | null
          lead_type?: string
          notes?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          status?: string
          teaches_intermediate_1?: boolean | null
          teaches_intermediate_2?: boolean | null
          teaches_intro_1?: boolean | null
          teaches_intro_2?: boolean | null
          teaching_evidence_notes?: string | null
          teaching_evidence_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_lead_suggestions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_phone_numbers: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          phone_e164: string
          status: string
          twilio_sid: string | null
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          phone_e164: string
          status?: string
          twilio_sid?: string | null
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          phone_e164?: string
          status?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_phone_numbers_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_research_job_items: {
        Row: {
          campus_id: string
          created_at: string
          current_step: string | null
          error: string | null
          failed_step: string | null
          families_with_zero: string[]
          finished_at: string | null
          id: string
          job_id: string
          leads_count: number
          profile_done: boolean
          retries: number
          sections_count: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          current_step?: string | null
          error?: string | null
          failed_step?: string | null
          families_with_zero?: string[]
          finished_at?: string | null
          id?: string
          job_id: string
          leads_count?: number
          profile_done?: boolean
          retries?: number
          sections_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          current_step?: string | null
          error?: string | null
          failed_step?: string | null
          families_with_zero?: string[]
          finished_at?: string | null
          id?: string
          job_id?: string
          leads_count?: number
          profile_done?: boolean
          retries?: number
          sections_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_research_job_items_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_research_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "campus_research_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_research_jobs: {
        Row: {
          created_at: string
          done_count: number
          failed_count: number
          finished_at: string | null
          id: string
          notes: string | null
          options: Json
          status: string
          total_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          done_count?: number
          failed_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          options?: Json
          status?: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          done_count?: number
          failed_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          options?: Json
          status?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      campus_tam_estimates: {
        Row: {
          accounting_completions: number | null
          accounting_major_estimate: number | null
          adoption_count_intermediate: number | null
          adoption_count_intro: number | null
          adoption_count_total: number | null
          adoption_sources: Json | null
          adoption_tracks: Json | null
          ai_summary: string | null
          assumptions_json: Json | null
          business_completions: number | null
          business_school_enrollment: number | null
          campus_id: string | null
          confidence_label: string | null
          confidence_score: number | null
          created_at: string
          estimated_at: string | null
          id: string
          manual_intermediate1_estimate: number | null
          manual_intermediate2_estimate: number | null
          manual_intro1_estimate: number | null
          manual_intro2_estimate: number | null
          manual_notes: string | null
          raw_source_json: Json | null
          source_type: string | null
          source_url: string | null
          source_year: string | null
          tam_intermediate1_base: number | null
          tam_intermediate1_high: number | null
          tam_intermediate1_low: number | null
          tam_intermediate2_base: number | null
          tam_intermediate2_high: number | null
          tam_intermediate2_low: number | null
          tam_intro1_base: number | null
          tam_intro1_high: number | null
          tam_intro1_low: number | null
          tam_intro2_base: number | null
          tam_intro2_high: number | null
          tam_intro2_low: number | null
          tam_notes: string | null
          tam_score: number | null
          tam_tier: string | null
          tam_total_base: number | null
          tam_total_high: number | null
          tam_total_low: number | null
          total_enrollment: number | null
          undergraduate_enrollment: number | null
          updated_at: string
        }
        Insert: {
          accounting_completions?: number | null
          accounting_major_estimate?: number | null
          adoption_count_intermediate?: number | null
          adoption_count_intro?: number | null
          adoption_count_total?: number | null
          adoption_sources?: Json | null
          adoption_tracks?: Json | null
          ai_summary?: string | null
          assumptions_json?: Json | null
          business_completions?: number | null
          business_school_enrollment?: number | null
          campus_id?: string | null
          confidence_label?: string | null
          confidence_score?: number | null
          created_at?: string
          estimated_at?: string | null
          id?: string
          manual_intermediate1_estimate?: number | null
          manual_intermediate2_estimate?: number | null
          manual_intro1_estimate?: number | null
          manual_intro2_estimate?: number | null
          manual_notes?: string | null
          raw_source_json?: Json | null
          source_type?: string | null
          source_url?: string | null
          source_year?: string | null
          tam_intermediate1_base?: number | null
          tam_intermediate1_high?: number | null
          tam_intermediate1_low?: number | null
          tam_intermediate2_base?: number | null
          tam_intermediate2_high?: number | null
          tam_intermediate2_low?: number | null
          tam_intro1_base?: number | null
          tam_intro1_high?: number | null
          tam_intro1_low?: number | null
          tam_intro2_base?: number | null
          tam_intro2_high?: number | null
          tam_intro2_low?: number | null
          tam_notes?: string | null
          tam_score?: number | null
          tam_tier?: string | null
          tam_total_base?: number | null
          tam_total_high?: number | null
          tam_total_low?: number | null
          total_enrollment?: number | null
          undergraduate_enrollment?: number | null
          updated_at?: string
        }
        Update: {
          accounting_completions?: number | null
          accounting_major_estimate?: number | null
          adoption_count_intermediate?: number | null
          adoption_count_intro?: number | null
          adoption_count_total?: number | null
          adoption_sources?: Json | null
          adoption_tracks?: Json | null
          ai_summary?: string | null
          assumptions_json?: Json | null
          business_completions?: number | null
          business_school_enrollment?: number | null
          campus_id?: string | null
          confidence_label?: string | null
          confidence_score?: number | null
          created_at?: string
          estimated_at?: string | null
          id?: string
          manual_intermediate1_estimate?: number | null
          manual_intermediate2_estimate?: number | null
          manual_intro1_estimate?: number | null
          manual_intro2_estimate?: number | null
          manual_notes?: string | null
          raw_source_json?: Json | null
          source_type?: string | null
          source_url?: string | null
          source_year?: string | null
          tam_intermediate1_base?: number | null
          tam_intermediate1_high?: number | null
          tam_intermediate1_low?: number | null
          tam_intermediate2_base?: number | null
          tam_intermediate2_high?: number | null
          tam_intermediate2_low?: number | null
          tam_intro1_base?: number | null
          tam_intro1_high?: number | null
          tam_intro1_low?: number | null
          tam_intro2_base?: number | null
          tam_intro2_high?: number | null
          tam_intro2_low?: number | null
          tam_notes?: string | null
          tam_score?: number | null
          tam_tier?: string | null
          tam_total_base?: number | null
          tam_total_high?: number | null
          tam_total_low?: number | null
          total_enrollment?: number | null
          undergraduate_enrollment?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_tam_estimates_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_waitlist: {
        Row: {
          campus_text: string | null
          course_text: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          source: string | null
          wants_call: boolean
          wants_text: boolean
        }
        Insert: {
          campus_text?: string | null
          course_text?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          wants_call?: boolean
          wants_text?: boolean
        }
        Update: {
          campus_text?: string | null
          course_text?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          wants_call?: boolean
          wants_text?: boolean
        }
        Relationships: []
      }
      campuses: {
        Row: {
          accounting_department_name: string | null
          accounting_department_url: string | null
          adoption_count_intermediate: number | null
          adoption_count_intro: number | null
          adoption_count_total: number | null
          adoption_group: string | null
          adoption_rank_intermediate: number | null
          adoption_rank_intro: number | null
          adoption_source: string | null
          adoption_sources: Json | null
          adoption_tracks: Json | null
          ai_enrichment_raw_json: Json | null
          ai_enrichment_status: string | null
          ai_research_debug_json: Json | null
          annual_tuition_in_state_cents: number | null
          annual_tuition_out_state_cents: number | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_at: string | null
          assigned_to: string | null
          assignment_batch: string | null
          assignment_notes: string | null
          assignment_status: string | null
          auto_name: string | null
          best_contact_type: string | null
          business_school_name: string | null
          canonical_name: string | null
          cheer: string | null
          city: string | null
          color_primary: string | null
          color_secondary: string | null
          color_tertiary: string | null
          colors_reviewed: boolean | null
          confidence_score: number | null
          country: string | null
          country_code: string | null
          course_aliases_json: Json | null
          course_code_notes: string | null
          course_codes_json: Json | null
          course_codes_reviewed: boolean | null
          course_family_codes_json: Json | null
          course_family_status_json: Json | null
          course_family_terms_json: Json | null
          course_family_textbooks_json: Json | null
          course_family_titles_json: Json | null
          created_at: string
          discovered_course_prefixes: Json | null
          domains: string[] | null
          due_date: string | null
          email_domain: string | null
          enriched_at: string | null
          enrichment_confidence_notes: string | null
          enrollment_source: string | null
          enrollment_source_year: string | null
          enrollment_updated_at: string | null
          generated_theme_json: Json | null
          hipolabs_raw_json: Json | null
          hipolabs_status: string | null
          id: string
          institution_name: string | null
          institution_type: string | null
          international: boolean | null
          ipeds_unitid: number | null
          is_active: boolean | null
          is_sec: boolean | null
          landing_page_approved_at: string | null
          landing_page_approved_by: string | null
          landing_page_notes: string | null
          landing_page_reviewed: boolean | null
          landing_page_status: string | null
          last_outreach_at: string | null
          market_priority: string | null
          marketing_notes: string | null
          mascot: string | null
          mascot_cheer: string | null
          name: string | null
          next_action: string | null
          outreach_notes: string | null
          outreach_status: string | null
          preview_slug: string | null
          priority_score: number | null
          priority_tier: string | null
          ready_for_outreach: boolean | null
          region: string | null
          review_notes: string | null
          rmp_last_checked_at: string | null
          rmp_match_confidence: number | null
          rmp_match_notes: string | null
          rmp_match_status: string | null
          rmp_raw_matches_json: Json | null
          rmp_school_id: string | null
          rmp_school_name: string | null
          rmp_school_url: string | null
          school_type: string | null
          scorecard_school_name: string | null
          semester_end: string | null
          semester_start: string | null
          short_name: string | null
          slug: string | null
          state: string | null
          status: string | null
          stripe_coupon_id: string | null
          subreddit: string | null
          subreddit_confidence: number | null
          textbook_notes: string | null
          textbook_status: string | null
          textbook_track: string | null
          timezone: string | null
          total_enrollment: number | null
          tuition_currency: string | null
          tuition_estimated_at: string | null
          tuition_notes: string | null
          tuition_source: string | null
          tuition_source_url: string | null
          undergrad_enrollment: number | null
          updated_at: string
          use_personal_phone: boolean
          use_school_colors: boolean | null
          warm_connection_notes: string | null
          website_url: string | null
        }
        Insert: {
          accounting_department_name?: string | null
          accounting_department_url?: string | null
          adoption_count_intermediate?: number | null
          adoption_count_intro?: number | null
          adoption_count_total?: number | null
          adoption_group?: string | null
          adoption_rank_intermediate?: number | null
          adoption_rank_intro?: number | null
          adoption_source?: string | null
          adoption_sources?: Json | null
          adoption_tracks?: Json | null
          ai_enrichment_raw_json?: Json | null
          ai_enrichment_status?: string | null
          ai_research_debug_json?: Json | null
          annual_tuition_in_state_cents?: number | null
          annual_tuition_out_state_cents?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          assignment_batch?: string | null
          assignment_notes?: string | null
          assignment_status?: string | null
          auto_name?: string | null
          best_contact_type?: string | null
          business_school_name?: string | null
          canonical_name?: string | null
          cheer?: string | null
          city?: string | null
          color_primary?: string | null
          color_secondary?: string | null
          color_tertiary?: string | null
          colors_reviewed?: boolean | null
          confidence_score?: number | null
          country?: string | null
          country_code?: string | null
          course_aliases_json?: Json | null
          course_code_notes?: string | null
          course_codes_json?: Json | null
          course_codes_reviewed?: boolean | null
          course_family_codes_json?: Json | null
          course_family_status_json?: Json | null
          course_family_terms_json?: Json | null
          course_family_textbooks_json?: Json | null
          course_family_titles_json?: Json | null
          created_at?: string
          discovered_course_prefixes?: Json | null
          domains?: string[] | null
          due_date?: string | null
          email_domain?: string | null
          enriched_at?: string | null
          enrichment_confidence_notes?: string | null
          enrollment_source?: string | null
          enrollment_source_year?: string | null
          enrollment_updated_at?: string | null
          generated_theme_json?: Json | null
          hipolabs_raw_json?: Json | null
          hipolabs_status?: string | null
          id?: string
          institution_name?: string | null
          institution_type?: string | null
          international?: boolean | null
          ipeds_unitid?: number | null
          is_active?: boolean | null
          is_sec?: boolean | null
          landing_page_approved_at?: string | null
          landing_page_approved_by?: string | null
          landing_page_notes?: string | null
          landing_page_reviewed?: boolean | null
          landing_page_status?: string | null
          last_outreach_at?: string | null
          market_priority?: string | null
          marketing_notes?: string | null
          mascot?: string | null
          mascot_cheer?: string | null
          name?: string | null
          next_action?: string | null
          outreach_notes?: string | null
          outreach_status?: string | null
          preview_slug?: string | null
          priority_score?: number | null
          priority_tier?: string | null
          ready_for_outreach?: boolean | null
          region?: string | null
          review_notes?: string | null
          rmp_last_checked_at?: string | null
          rmp_match_confidence?: number | null
          rmp_match_notes?: string | null
          rmp_match_status?: string | null
          rmp_raw_matches_json?: Json | null
          rmp_school_id?: string | null
          rmp_school_name?: string | null
          rmp_school_url?: string | null
          school_type?: string | null
          scorecard_school_name?: string | null
          semester_end?: string | null
          semester_start?: string | null
          short_name?: string | null
          slug?: string | null
          state?: string | null
          status?: string | null
          stripe_coupon_id?: string | null
          subreddit?: string | null
          subreddit_confidence?: number | null
          textbook_notes?: string | null
          textbook_status?: string | null
          textbook_track?: string | null
          timezone?: string | null
          total_enrollment?: number | null
          tuition_currency?: string | null
          tuition_estimated_at?: string | null
          tuition_notes?: string | null
          tuition_source?: string | null
          tuition_source_url?: string | null
          undergrad_enrollment?: number | null
          updated_at?: string
          use_personal_phone?: boolean
          use_school_colors?: boolean | null
          warm_connection_notes?: string | null
          website_url?: string | null
        }
        Update: {
          accounting_department_name?: string | null
          accounting_department_url?: string | null
          adoption_count_intermediate?: number | null
          adoption_count_intro?: number | null
          adoption_count_total?: number | null
          adoption_group?: string | null
          adoption_rank_intermediate?: number | null
          adoption_rank_intro?: number | null
          adoption_source?: string | null
          adoption_sources?: Json | null
          adoption_tracks?: Json | null
          ai_enrichment_raw_json?: Json | null
          ai_enrichment_status?: string | null
          ai_research_debug_json?: Json | null
          annual_tuition_in_state_cents?: number | null
          annual_tuition_out_state_cents?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          assignment_batch?: string | null
          assignment_notes?: string | null
          assignment_status?: string | null
          auto_name?: string | null
          best_contact_type?: string | null
          business_school_name?: string | null
          canonical_name?: string | null
          cheer?: string | null
          city?: string | null
          color_primary?: string | null
          color_secondary?: string | null
          color_tertiary?: string | null
          colors_reviewed?: boolean | null
          confidence_score?: number | null
          country?: string | null
          country_code?: string | null
          course_aliases_json?: Json | null
          course_code_notes?: string | null
          course_codes_json?: Json | null
          course_codes_reviewed?: boolean | null
          course_family_codes_json?: Json | null
          course_family_status_json?: Json | null
          course_family_terms_json?: Json | null
          course_family_textbooks_json?: Json | null
          course_family_titles_json?: Json | null
          created_at?: string
          discovered_course_prefixes?: Json | null
          domains?: string[] | null
          due_date?: string | null
          email_domain?: string | null
          enriched_at?: string | null
          enrichment_confidence_notes?: string | null
          enrollment_source?: string | null
          enrollment_source_year?: string | null
          enrollment_updated_at?: string | null
          generated_theme_json?: Json | null
          hipolabs_raw_json?: Json | null
          hipolabs_status?: string | null
          id?: string
          institution_name?: string | null
          institution_type?: string | null
          international?: boolean | null
          ipeds_unitid?: number | null
          is_active?: boolean | null
          is_sec?: boolean | null
          landing_page_approved_at?: string | null
          landing_page_approved_by?: string | null
          landing_page_notes?: string | null
          landing_page_reviewed?: boolean | null
          landing_page_status?: string | null
          last_outreach_at?: string | null
          market_priority?: string | null
          marketing_notes?: string | null
          mascot?: string | null
          mascot_cheer?: string | null
          name?: string | null
          next_action?: string | null
          outreach_notes?: string | null
          outreach_status?: string | null
          preview_slug?: string | null
          priority_score?: number | null
          priority_tier?: string | null
          ready_for_outreach?: boolean | null
          region?: string | null
          review_notes?: string | null
          rmp_last_checked_at?: string | null
          rmp_match_confidence?: number | null
          rmp_match_notes?: string | null
          rmp_match_status?: string | null
          rmp_raw_matches_json?: Json | null
          rmp_school_id?: string | null
          rmp_school_name?: string | null
          rmp_school_url?: string | null
          school_type?: string | null
          scorecard_school_name?: string | null
          semester_end?: string | null
          semester_start?: string | null
          short_name?: string | null
          slug?: string | null
          state?: string | null
          status?: string | null
          stripe_coupon_id?: string | null
          subreddit?: string | null
          subreddit_confidence?: number | null
          textbook_notes?: string | null
          textbook_status?: string | null
          textbook_track?: string | null
          timezone?: string | null
          total_enrollment?: number | null
          tuition_currency?: string | null
          tuition_estimated_at?: string | null
          tuition_notes?: string | null
          tuition_source?: string | null
          tuition_source_url?: string | null
          undergrad_enrollment?: number | null
          updated_at?: string
          use_personal_phone?: boolean
          use_school_colors?: boolean | null
          warm_connection_notes?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      ceq_concepts: {
        Row: {
          ceq_id: string
          concept_id: string
          created_at: string
          id: string
          is_primary: boolean
        }
        Insert: {
          ceq_id: string
          concept_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          ceq_id?: string
          concept_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ceq_concepts_ceq_id_fkey"
            columns: ["ceq_id"]
            isOneToOne: false
            referencedRelation: "ceqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ceq_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      ceq_teaching_blocks: {
        Row: {
          block_type: string | null
          body: string | null
          chapter_id: string | null
          created_at: string
          id: string
          sort_order: number | null
          source_asset_id: string | null
          source_note_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          block_type?: string | null
          body?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          sort_order?: number | null
          source_asset_id?: string | null
          source_note_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          block_type?: string | null
          body?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          sort_order?: number | null
          source_asset_id?: string | null
          source_note_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ceq_teaching_blocks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ceq_teaching_blocks_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ceq_teaching_blocks_source_note_id_fkey"
            columns: ["source_note_id"]
            isOneToOne: false
            referencedRelation: "ceq_tutoring_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      ceq_tutoring_notes: {
        Row: {
          chapter_id: string | null
          created_at: string
          file_name: string | null
          id: string
          ocr_error: string | null
          ocr_status: string | null
          ocr_text: string | null
          page_count: number | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          ocr_error?: string | null
          ocr_status?: string | null
          ocr_text?: string | null
          page_count?: number | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          ocr_error?: string | null
          ocr_status?: string | null
          ocr_text?: string | null
          page_count?: number | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ceq_tutoring_notes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      ceqs: {
        Row: {
          admin_notes: string | null
          answer: string | null
          ceq_type: string | null
          common_mistake: string | null
          created_at: string
          difficulty: string | null
          draft_instruction: string | null
          explanation: string | null
          formula_block: string | null
          id: string
          include_common_mistake: boolean | null
          include_formula: boolean | null
          include_je: boolean | null
          include_student_explanation: boolean | null
          include_t_accounts: boolean | null
          include_teaching_script: boolean | null
          je_block: string | null
          mc_choices: Json | null
          progressive_reveal: boolean | null
          status: string | null
          student_explanation: string | null
          student_prompt: string | null
          t_account_block: string | null
          teaching_asset_id: string | null
          teaching_script: string | null
          thinking: Json | null
          title: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          answer?: string | null
          ceq_type?: string | null
          common_mistake?: string | null
          created_at?: string
          difficulty?: string | null
          draft_instruction?: string | null
          explanation?: string | null
          formula_block?: string | null
          id?: string
          include_common_mistake?: boolean | null
          include_formula?: boolean | null
          include_je?: boolean | null
          include_student_explanation?: boolean | null
          include_t_accounts?: boolean | null
          include_teaching_script?: boolean | null
          je_block?: string | null
          mc_choices?: Json | null
          progressive_reveal?: boolean | null
          status?: string | null
          student_explanation?: string | null
          student_prompt?: string | null
          t_account_block?: string | null
          teaching_asset_id?: string | null
          teaching_script?: string | null
          thinking?: Json | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          answer?: string | null
          ceq_type?: string | null
          common_mistake?: string | null
          created_at?: string
          difficulty?: string | null
          draft_instruction?: string | null
          explanation?: string | null
          formula_block?: string | null
          id?: string
          include_common_mistake?: boolean | null
          include_formula?: boolean | null
          include_je?: boolean | null
          include_student_explanation?: boolean | null
          include_t_accounts?: boolean | null
          include_teaching_script?: boolean | null
          je_block?: string | null
          mc_choices?: Json | null
          progressive_reveal?: boolean | null
          status?: string | null
          student_explanation?: string | null
          student_prompt?: string | null
          t_account_block?: string | null
          teaching_asset_id?: string | null
          teaching_script?: string | null
          thinking?: Json | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ceqs_teaching_asset_id_fkey"
            columns: ["teaching_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_accounts: {
        Row: {
          account_description: string | null
          account_name: string | null
          account_type: string | null
          balance_tooltip: string | null
          chapter_id: string | null
          contra_tooltip: string | null
          created_at: string
          credit_tooltip: string | null
          debit_tooltip: string | null
          example_beginning_balance: number | null
          example_credit_amount: number | null
          example_date_label: string | null
          example_debit_amount: number | null
          example_ending_balance: number | null
          fs_placement_tooltip: string | null
          generated_at: string | null
          id: string
          is_approved: boolean | null
          is_rejected: boolean | null
          normal_balance: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          account_description?: string | null
          account_name?: string | null
          account_type?: string | null
          balance_tooltip?: string | null
          chapter_id?: string | null
          contra_tooltip?: string | null
          created_at?: string
          credit_tooltip?: string | null
          debit_tooltip?: string | null
          example_beginning_balance?: number | null
          example_credit_amount?: number | null
          example_date_label?: string | null
          example_debit_amount?: number | null
          example_ending_balance?: number | null
          fs_placement_tooltip?: string | null
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          normal_balance?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          account_description?: string | null
          account_name?: string | null
          account_type?: string | null
          balance_tooltip?: string | null
          chapter_id?: string | null
          contra_tooltip?: string | null
          created_at?: string
          credit_tooltip?: string | null
          debit_tooltip?: string | null
          example_beginning_balance?: number | null
          example_credit_amount?: number | null
          example_date_label?: string | null
          example_debit_amount?: number | null
          example_ending_balance?: number | null
          fs_placement_tooltip?: string | null
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          normal_balance?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_accounts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_exam_mistakes: {
        Row: {
          chapter_id: string | null
          created_at: string
          example_text: string | null
          explanation: string | null
          generated_at: string | null
          id: string
          is_approved: boolean | null
          is_rejected: boolean | null
          mistake: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string
          example_text?: string | null
          explanation?: string | null
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          mistake?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          created_at?: string
          example_text?: string | null
          explanation?: string | null
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          mistake?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_exam_mistakes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_formulas: {
        Row: {
          chapter_id: string | null
          components: Json | null
          created_at: string
          formula_explanation: string | null
          formula_expression: string | null
          formula_name: string | null
          generated_at: string | null
          id: string
          image_url: string | null
          is_approved: boolean | null
          is_rejected: boolean | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          components?: Json | null
          created_at?: string
          formula_explanation?: string | null
          formula_expression?: string | null
          formula_name?: string | null
          generated_at?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          is_rejected?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          components?: Json | null
          created_at?: string
          formula_explanation?: string | null
          formula_expression?: string | null
          formula_name?: string | null
          generated_at?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          is_rejected?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_formulas_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_je_categories: {
        Row: {
          category_name: string | null
          chapter_id: string | null
          created_at: string
          id: string
          sort_order: number | null
        }
        Insert: {
          category_name?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          sort_order?: number | null
        }
        Update: {
          category_name?: string | null
          chapter_id?: string | null
          created_at?: string
          id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_je_categories_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_journal_entries: {
        Row: {
          category_id: string | null
          chapter_id: string | null
          created_at: string
          generated_at: string | null
          id: string
          is_approved: boolean | null
          is_rejected: boolean | null
          je_lines: Json | null
          sort_order: number | null
          source: string | null
          transaction_label: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          chapter_id?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          je_lines?: Json | null
          sort_order?: number | null
          source?: string | null
          transaction_label?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          chapter_id?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          je_lines?: Json | null
          sort_order?: number | null
          source?: string | null
          transaction_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_journal_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "chapter_je_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_journal_entries_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_key_terms: {
        Row: {
          category: string | null
          chapter_id: string | null
          created_at: string
          definition: string | null
          generated_at: string | null
          id: string
          is_approved: boolean | null
          is_rejected: boolean | null
          sort_order: number | null
          term: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          chapter_id?: string | null
          created_at?: string
          definition?: string | null
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          sort_order?: number | null
          term?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          chapter_id?: string | null
          created_at?: string
          definition?: string | null
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_rejected?: boolean | null
          sort_order?: number | null
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_key_terms_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_purpose: {
        Row: {
          chapter_id: string | null
          consequence_bullets: Json | null
          created_at: string
          generated_at: string | null
          id: string
          is_approved: boolean | null
          purpose_bullets: Json | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          consequence_bullets?: Json | null
          created_at?: string
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          purpose_bullets?: Json | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          consequence_bullets?: Json | null
          created_at?: string
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          purpose_bullets?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_purpose_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_topics: {
        Row: {
          asset_codes: string[] | null
          chapter_id: string | null
          course_id: string | null
          created_at: string
          display_order: number | null
          generated_by_ai: boolean | null
          id: string
          is_active: boolean | null
          is_supplementary: boolean | null
          lw_imported: boolean | null
          lw_imported_at: string | null
          lw_imported_by: string | null
          lw_quiz_link: string | null
          lw_video_link: string | null
          merged_into_topic_id: string | null
          original_asset_codes: string[] | null
          quiz_status: string | null
          topic_description: string | null
          topic_name: string | null
          topic_number: number | null
          topic_rationale: string | null
          video_status: string | null
        }
        Insert: {
          asset_codes?: string[] | null
          chapter_id?: string | null
          course_id?: string | null
          created_at?: string
          display_order?: number | null
          generated_by_ai?: boolean | null
          id?: string
          is_active?: boolean | null
          is_supplementary?: boolean | null
          lw_imported?: boolean | null
          lw_imported_at?: string | null
          lw_imported_by?: string | null
          lw_quiz_link?: string | null
          lw_video_link?: string | null
          merged_into_topic_id?: string | null
          original_asset_codes?: string[] | null
          quiz_status?: string | null
          topic_description?: string | null
          topic_name?: string | null
          topic_number?: number | null
          topic_rationale?: string | null
          video_status?: string | null
        }
        Update: {
          asset_codes?: string[] | null
          chapter_id?: string | null
          course_id?: string | null
          created_at?: string
          display_order?: number | null
          generated_by_ai?: boolean | null
          id?: string
          is_active?: boolean | null
          is_supplementary?: boolean | null
          lw_imported?: boolean | null
          lw_imported_at?: string | null
          lw_imported_by?: string | null
          lw_quiz_link?: string | null
          lw_video_link?: string | null
          merged_into_topic_id?: string | null
          original_asset_codes?: string[] | null
          quiz_status?: string | null
          topic_description?: string | null
          topic_name?: string | null
          topic_number?: number | null
          topic_rationale?: string | null
          video_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_topics_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_topics_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_topics_merged_into_topic_id_fkey"
            columns: ["merged_into_topic_id"]
            isOneToOne: false
            referencedRelation: "chapter_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          chapter_name: string | null
          chapter_number: number | null
          course_id: string | null
          created_at: string
          id: string
          je_only_mode: boolean | null
          target_lessons: number | null
          topics_locked: boolean | null
          topics_locked_at: string | null
          topics_locked_count: number | null
        }
        Insert: {
          chapter_name?: string | null
          chapter_number?: number | null
          course_id?: string | null
          created_at?: string
          id?: string
          je_only_mode?: boolean | null
          target_lessons?: number | null
          topics_locked?: boolean | null
          topics_locked_at?: string | null
          topics_locked_count?: number | null
        }
        Update: {
          chapter_name?: string | null
          chapter_number?: number | null
          course_id?: string | null
          created_at?: string
          id?: string
          je_only_mode?: boolean | null
          target_lessons?: number | null
          topics_locked?: boolean | null
          topics_locked_at?: string | null
          topics_locked_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_type: string | null
          canonical_name: string | null
          created_at: string
          id: string
          is_global_default: boolean | null
          keywords: string[] | null
          normal_balance: string | null
        }
        Insert: {
          account_type?: string | null
          canonical_name?: string | null
          created_at?: string
          id?: string
          is_global_default?: boolean | null
          keywords?: string[] | null
          normal_balance?: string | null
        }
        Update: {
          account_type?: string | null
          canonical_name?: string | null
          created_at?: string
          id?: string
          is_global_default?: boolean | null
          keywords?: string[] | null
          normal_balance?: string | null
        }
        Relationships: []
      }
      company_names: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          name: string | null
          notes: string | null
          style: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          style?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          style?: string | null
        }
        Relationships: []
      }
      concepts: {
        Row: {
          course_area: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_concept_id: string | null
          slug: string
        }
        Insert: {
          course_area?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_concept_id?: string | null
          slug: string
        }
        Update: {
          course_area?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_concept_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_parent_concept_id_fkey"
            columns: ["parent_concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      course_textbooks: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          textbook_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          textbook_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          textbook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_textbooks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_textbooks_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string | null
          course_name: string | null
          created_at: string
          description: string | null
          id: string
          slug: string | null
        }
        Insert: {
          code?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          slug?: string | null
        }
        Update: {
          code?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          slug?: string | null
        }
        Relationships: []
      }
      dissector_problems: {
        Row: {
          chapter_id: string | null
          completions: number | null
          course_id: string | null
          created_at: string
          highlights: Json | null
          id: string
          plays: number | null
          problem_text: string | null
          status: string | null
          teaching_asset_id: string | null
        }
        Insert: {
          chapter_id?: string | null
          completions?: number | null
          course_id?: string | null
          created_at?: string
          highlights?: Json | null
          id?: string
          plays?: number | null
          problem_text?: string | null
          status?: string | null
          teaching_asset_id?: string | null
        }
        Update: {
          chapter_id?: string | null
          completions?: number | null
          course_id?: string | null
          created_at?: string
          highlights?: Json | null
          id?: string
          plays?: number | null
          problem_text?: string | null
          status?: string | null
          teaching_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dissector_problems_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dissector_problems_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dissector_problems_teaching_asset_id_fkey"
            columns: ["teaching_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_builder_accounts: {
        Row: {
          account_name: string | null
          account_type: string | null
          chapter_id: string | null
          id: string
          normal_balance: string | null
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          chapter_id?: string | null
          id?: string
          normal_balance?: string | null
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          chapter_id?: string | null
          id?: string
          normal_balance?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_builder_accounts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_builder_items: {
        Row: {
          date_label: string | null
          deleted: boolean | null
          entries: Json | null
          id: string
          set_id: string | null
          sort_order: number | null
          source_asset_id: string | null
          transaction_description: string | null
        }
        Insert: {
          date_label?: string | null
          deleted?: boolean | null
          entries?: Json | null
          id?: string
          set_id?: string | null
          sort_order?: number | null
          source_asset_id?: string | null
          transaction_description?: string | null
        }
        Update: {
          date_label?: string | null
          deleted?: boolean | null
          entries?: Json | null
          id?: string
          set_id?: string | null
          sort_order?: number | null
          source_asset_id?: string | null
          transaction_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_builder_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "entry_builder_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_builder_items_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_builder_sets: {
        Row: {
          chapter_id: string | null
          completions: number | null
          course_id: string | null
          created_at: string
          id: string
          plays: number | null
          status: string | null
        }
        Insert: {
          chapter_id?: string | null
          completions?: number | null
          course_id?: string | null
          created_at?: string
          id?: string
          plays?: number | null
          status?: string | null
        }
        Update: {
          chapter_id?: string | null
          completions?: number | null
          course_id?: string | null
          created_at?: string
          id?: string
          plays?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_builder_sets_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_builder_sets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_decks: {
        Row: {
          chapter_id: string | null
          chapter_number: number | null
          completions: number | null
          course_code: string | null
          course_id: string | null
          created_at: string
          id: string
          plays: number | null
          status: string | null
          total_cards: number | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          chapter_number?: number | null
          completions?: number | null
          course_code?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          plays?: number | null
          status?: string | null
          total_cards?: number | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          chapter_number?: number | null
          completions?: number | null
          course_code?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          plays?: number | null
          status?: string | null
          total_cards?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_decks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back: string | null
          card_type: string | null
          created_at: string
          deck_id: string | null
          deleted: boolean | null
          front: string | null
          id: string
          sort_order: number | null
          source_asset_id: string | null
        }
        Insert: {
          back?: string | null
          card_type?: string | null
          created_at?: string
          deck_id?: string | null
          deleted?: boolean | null
          front?: string | null
          id?: string
          sort_order?: number | null
          source_asset_id?: string | null
        }
        Update: {
          back?: string | null
          card_type?: string | null
          created_at?: string
          deck_id?: string | null
          deleted?: boolean | null
          front?: string | null
          id?: string
          sort_order?: number | null
          source_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_items: {
        Row: {
          deleted: boolean | null
          formula_name: string | null
          formula_text: string | null
          hint: string | null
          id: string
          set_id: string | null
          sort_order: number | null
          source_asset_id: string | null
        }
        Insert: {
          deleted?: boolean | null
          formula_name?: string | null
          formula_text?: string | null
          hint?: string | null
          id?: string
          set_id?: string | null
          sort_order?: number | null
          source_asset_id?: string | null
        }
        Update: {
          deleted?: boolean | null
          formula_name?: string | null
          formula_text?: string | null
          hint?: string | null
          id?: string
          set_id?: string | null
          sort_order?: number | null
          source_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formula_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "formula_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_items_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_sets: {
        Row: {
          chapter_id: string | null
          completions: number | null
          course_id: string | null
          created_at: string
          id: string
          plays: number | null
          status: string | null
        }
        Insert: {
          chapter_id?: string | null
          completions?: number | null
          course_id?: string | null
          created_at?: string
          id?: string
          plays?: number | null
          status?: string | null
        }
        Update: {
          chapter_id?: string | null
          completions?: number | null
          course_id?: string | null
          created_at?: string
          id?: string
          plays?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formula_sets_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_sets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_events: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          kind: string
          lead_id: string | null
          token: string | null
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          kind: string
          lead_id?: string | null
          token?: string | null
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string | null
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_page_events_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_page_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_leads: {
        Row: {
          campus_signup_number: number | null
          course_slug: string | null
          created_at: string
          email: string | null
          email_type: string | null
          id: string
          intent_tag: string | null
          source: string | null
          university_domain: string | null
          university_name: string | null
        }
        Insert: {
          campus_signup_number?: number | null
          course_slug?: string | null
          created_at?: string
          email?: string | null
          email_type?: string | null
          id?: string
          intent_tag?: string | null
          source?: string | null
          university_domain?: string | null
          university_name?: string | null
        }
        Update: {
          campus_signup_number?: number | null
          course_slug?: string | null
          created_at?: string
          email?: string | null
          email_type?: string | null
          id?: string
          intent_tag?: string | null
          source?: string | null
          university_domain?: string | null
          university_name?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      outreach_broadcasts: {
        Row: {
          body: string
          campus_ids: string[] | null
          created_at: string
          error: string | null
          id: string
          include_replied: boolean
          lead_type: string
          name: string
          send_at: string
          sent_count: number
          skipped_count: number
          status: string
          subject: string
        }
        Insert: {
          body: string
          campus_ids?: string[] | null
          created_at?: string
          error?: string | null
          id?: string
          include_replied?: boolean
          lead_type?: string
          name: string
          send_at: string
          sent_count?: number
          skipped_count?: number
          status?: string
          subject: string
        }
        Update: {
          body?: string
          campus_ids?: string[] | null
          created_at?: string
          error?: string | null
          id?: string
          include_replied?: boolean
          lead_type?: string
          name?: string
          send_at?: string
          sent_count?: number
          skipped_count?: number
          status?: string
          subject?: string
        }
        Relationships: []
      }
      outreach_campaign_leads: {
        Row: {
          campaign_id: string
          campus_id: string | null
          course_family: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lead_type: string | null
          outreach_lead_id: string
          scheduled_send_at: string | null
          sequence_step: number
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campus_id?: string | null
          course_family?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_type?: string | null
          outreach_lead_id: string
          scheduled_send_at?: string | null
          sequence_step?: number
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campus_id?: string | null
          course_family?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_type?: string | null
          outreach_lead_id?: string
          scheduled_send_at?: string | null
          sequence_step?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaign_leads_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaign_leads_outreach_lead_id_fkey"
            columns: ["outreach_lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          audience_filters: Json
          campaign_type: string
          created_at: string
          created_by: string | null
          daily_limit: number
          estimated_days: number | null
          id: string
          name: string
          status: string
          total_campuses: number
          total_leads: number
          updated_at: string
        }
        Insert: {
          audience_filters?: Json
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          estimated_days?: number | null
          id?: string
          name: string
          status?: string
          total_campuses?: number
          total_leads?: number
          updated_at?: string
        }
        Update: {
          audience_filters?: Json
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          estimated_days?: number | null
          id?: string
          name?: string
          status?: string
          total_campuses?: number
          total_leads?: number
          updated_at?: string
        }
        Relationships: []
      }
      outreach_email_events: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_email_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_email_templates: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_active: boolean | null
          is_locked: boolean | null
          kind: string | null
          name: string | null
          subject: string | null
          updated_at: string
          variant: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          kind?: string | null
          name?: string | null
          subject?: string | null
          updated_at?: string
          variant?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          kind?: string | null
          name?: string | null
          subject?: string | null
          updated_at?: string
          variant?: string | null
        }
        Relationships: []
      }
      outreach_leads: {
        Row: {
          affiliation: string | null
          bounced_at: string | null
          campus_id: string | null
          clicks_count: number | null
          complained_at: string | null
          course_notes: string | null
          created_at: string
          delivered_at: string | null
          department: string | null
          email: string | null
          first_clicked_at: string | null
          first_name: string | null
          first_opened_at: string | null
          follow_up_1_sent_at: string | null
          follow_up_2_sent_at: string | null
          follow_up_3_sent_at: string | null
          id: string
          is_phd: boolean | null
          landing_token: string | null
          last_message_id: string | null
          last_name: string | null
          notes: string | null
          opens_count: number | null
          replied_at: string | null
          scheduled_send_at: string | null
          school_id: string | null
          sent_at: string | null
          sequence_stopped_at: string | null
          sequence_stopped_reason: string | null
          skip_landing_page: boolean | null
          source: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          affiliation?: string | null
          bounced_at?: string | null
          campus_id?: string | null
          clicks_count?: number | null
          complained_at?: string | null
          course_notes?: string | null
          created_at?: string
          delivered_at?: string | null
          department?: string | null
          email?: string | null
          first_clicked_at?: string | null
          first_name?: string | null
          first_opened_at?: string | null
          follow_up_1_sent_at?: string | null
          follow_up_2_sent_at?: string | null
          follow_up_3_sent_at?: string | null
          id?: string
          is_phd?: boolean | null
          landing_token?: string | null
          last_message_id?: string | null
          last_name?: string | null
          notes?: string | null
          opens_count?: number | null
          replied_at?: string | null
          scheduled_send_at?: string | null
          school_id?: string | null
          sent_at?: string | null
          sequence_stopped_at?: string | null
          sequence_stopped_reason?: string | null
          skip_landing_page?: boolean | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          affiliation?: string | null
          bounced_at?: string | null
          campus_id?: string | null
          clicks_count?: number | null
          complained_at?: string | null
          course_notes?: string | null
          created_at?: string
          delivered_at?: string | null
          department?: string | null
          email?: string | null
          first_clicked_at?: string | null
          first_name?: string | null
          first_opened_at?: string | null
          follow_up_1_sent_at?: string | null
          follow_up_2_sent_at?: string | null
          follow_up_3_sent_at?: string | null
          id?: string
          is_phd?: boolean | null
          landing_token?: string | null
          last_message_id?: string | null
          last_name?: string | null
          notes?: string | null
          opens_count?: number | null
          replied_at?: string | null
          scheduled_send_at?: string | null
          school_id?: string | null
          sent_at?: string | null
          sequence_stopped_at?: string | null
          sequence_stopped_reason?: string | null
          skip_landing_page?: boolean | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_leads_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_leads_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "outreach_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_saved_views: {
        Row: {
          builtin_key: string | null
          created_at: string
          filters: Json | null
          id: string
          is_builtin: boolean | null
          is_shared: boolean | null
          name: string | null
          sort_order: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          builtin_key?: string | null
          created_at?: string
          filters?: Json | null
          id?: string
          is_builtin?: boolean | null
          is_shared?: boolean | null
          name?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          builtin_key?: string | null
          created_at?: string
          filters?: Json | null
          id?: string
          is_builtin?: boolean | null
          is_shared?: boolean | null
          name?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      outreach_schools: {
        Row: {
          course_codes: string[] | null
          created_at: string
          id: string
          landing_page_status: string | null
          mascot: string | null
          school_colors: string[] | null
          school_name: string | null
          slug: string | null
          updated_at: string
          waitlist_count: number | null
        }
        Insert: {
          course_codes?: string[] | null
          created_at?: string
          id?: string
          landing_page_status?: string | null
          mascot?: string | null
          school_colors?: string[] | null
          school_name?: string | null
          slug?: string | null
          updated_at?: string
          waitlist_count?: number | null
        }
        Update: {
          course_codes?: string[] | null
          created_at?: string
          id?: string
          landing_page_status?: string | null
          mascot?: string | null
          school_colors?: string[] | null
          school_name?: string | null
          slug?: string | null
          updated_at?: string
          waitlist_count?: number | null
        }
        Relationships: []
      }
      outreach_send_log: {
        Row: {
          id: string
          lead_id: string | null
          sender_email: string | null
          sent_at: string | null
        }
        Insert: {
          id?: string
          lead_id?: string | null
          sender_email?: string | null
          sent_at?: string | null
        }
        Update: {
          id?: string
          lead_id?: string | null
          sender_email?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_send_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_settings: {
        Row: {
          auto_schedule_on_import: boolean
          global_daily_send_limit: number
          id: number
          intermediate_1_availability: string
          intermediate_2_availability: string
          intro_1_availability: string
          intro_2_availability: string
          updated_at: string
        }
        Insert: {
          auto_schedule_on_import?: boolean
          global_daily_send_limit?: number
          id?: number
          intermediate_1_availability?: string
          intermediate_2_availability?: string
          intro_1_availability?: string
          intro_2_availability?: string
          updated_at?: string
        }
        Update: {
          auto_schedule_on_import?: boolean
          global_daily_send_limit?: number
          id?: number
          intermediate_1_availability?: string
          intermediate_2_availability?: string
          intro_1_availability?: string
          intro_2_availability?: string
          updated_at?: string
        }
        Relationships: []
      }
      outreach_student_leads: {
        Row: {
          campus_id: string | null
          campus_slug: string | null
          course_code: string | null
          created_at: string
          email: string | null
          id: string
          referrer: string | null
          school_name: string | null
          source: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          campus_id?: string | null
          campus_slug?: string | null
          course_code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          referrer?: string | null
          school_name?: string | null
          source?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          campus_id?: string | null
          campus_slug?: string | null
          course_code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          referrer?: string | null
          school_name?: string | null
          source?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_student_leads_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_va_campus_assignments: {
        Row: {
          assigned_by_email: string | null
          assigned_for_date: string | null
          campus_id: string | null
          claim_expires_at: string | null
          claimed_at: string | null
          created_at: string
          id: string
          notes: string | null
          released_at: string | null
          status: string
          va_account_id: string | null
        }
        Insert: {
          assigned_by_email?: string | null
          assigned_for_date?: string | null
          campus_id?: string | null
          claim_expires_at?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          released_at?: string | null
          status?: string
          va_account_id?: string | null
        }
        Update: {
          assigned_by_email?: string | null
          assigned_for_date?: string | null
          campus_id?: string | null
          claim_expires_at?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          released_at?: string | null
          status?: string
          va_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_va_campus_assignments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_va_campus_assignments_va_account_id_fkey"
            columns: ["va_account_id"]
            isOneToOne: false
            referencedRelation: "va_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_waitlist_signups: {
        Row: {
          campus_id: string | null
          course: string | null
          course_family: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          need_help_with: string | null
          notes: string | null
          phone: string | null
          school_id: string | null
          syllabus_file_path: string | null
        }
        Insert: {
          campus_id?: string | null
          course?: string | null
          course_family?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          need_help_with?: string | null
          notes?: string | null
          phone?: string | null
          school_id?: string | null
          syllabus_file_path?: string | null
        }
        Update: {
          campus_id?: string | null
          course?: string | null
          course_family?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          need_help_with?: string | null
          notes?: string | null
          phone?: string | null
          school_id?: string | null
          syllabus_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_waitlist_signups_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_waitlist_signups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "outreach_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      session_prep_submissions: {
        Row: {
          appointment_at: string | null
          course: string | null
          created_at: string
          email: string | null
          file_paths: string[] | null
          id: string
          name: string | null
          notes: string | null
          school: string | null
        }
        Insert: {
          appointment_at?: string | null
          course?: string | null
          created_at?: string
          email?: string | null
          file_paths?: string[] | null
          id?: string
          name?: string | null
          notes?: string | null
          school?: string | null
        }
        Update: {
          appointment_at?: string | null
          course?: string | null
          created_at?: string
          email?: string | null
          file_paths?: string[] | null
          id?: string
          name?: string | null
          notes?: string | null
          school?: string | null
        }
        Relationships: []
      }
      sms_conversations: {
        Row: {
          campus_id: string | null
          campus_number: string
          course: string | null
          created_at: string
          exam_date: string | null
          id: string
          last_message_at: string
          major: string | null
          opener_sent: boolean
          sentiment: string | null
          short_ref: number
          status: string
          struggles: string | null
          student_phone: string
        }
        Insert: {
          campus_id?: string | null
          campus_number: string
          course?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          last_message_at?: string
          major?: string | null
          opener_sent?: boolean
          sentiment?: string | null
          short_ref?: number
          status?: string
          struggles?: string | null
          student_phone: string
        }
        Update: {
          campus_id?: string | null
          campus_number?: string
          course?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          last_message_at?: string
          major?: string | null
          opener_sent?: boolean
          sentiment?: string | null
          short_ref?: number
          status?: string
          struggles?: string | null
          student_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          author: string | null
          body: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          twilio_sid: string | null
        }
        Insert: {
          author?: string | null
          body: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          twilio_sid?: string | null
        }
        Update: {
          author?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_outbox: {
        Row: {
          author: string
          body: string
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          send_at: string
          status: string
        }
        Insert: {
          author?: string
          body: string
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          send_at: string
          status?: string
        }
        Update: {
          author?: string
          body?: string
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          send_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      student_emails: {
        Row: {
          attempted_at: string | null
          chapter_id: string | null
          converted: boolean | null
          course_id: string | null
          email: string | null
          founding_student: boolean | null
          id: string
        }
        Insert: {
          attempted_at?: string | null
          chapter_id?: string | null
          converted?: boolean | null
          course_id?: string | null
          email?: string | null
          founding_student?: boolean | null
          id?: string
        }
        Update: {
          attempted_at?: string | null
          chapter_id?: string | null
          converted?: boolean | null
          course_id?: string | null
          email?: string | null
          founding_student?: boolean | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_emails_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_emails_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_asset_ceq_flags: {
        Row: {
          is_core: boolean | null
          marked_at: string | null
          marked_by: string | null
          teaching_asset_id: string | null
        }
        Insert: {
          is_core?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          teaching_asset_id?: string | null
        }
        Update: {
          is_core?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          teaching_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teaching_asset_ceq_flags_teaching_asset_id_fkey"
            columns: ["teaching_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_asset_ceq_part_focus: {
        Row: {
          created_at: string
          id: string
          part_index: number | null
          part_label: string | null
          teaching_asset_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          part_index?: number | null
          part_label?: string | null
          teaching_asset_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          part_index?: number | null
          part_label?: string | null
          teaching_asset_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_asset_ceq_part_focus_teaching_asset_id_fkey"
            columns: ["teaching_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_asset_concepts: {
        Row: {
          concept_id: string
          created_at: string
          id: string
          is_primary: boolean
          teaching_asset_id: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          teaching_asset_id: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          teaching_asset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_asset_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_asset_concepts_teaching_asset_id_fkey"
            columns: ["teaching_asset_id"]
            isOneToOne: false
            referencedRelation: "teaching_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_assets: {
        Row: {
          admin_notes: Json | null
          asset_approved_at: string | null
          asset_name: string | null
          asset_type: string | null
          chapter_id: string | null
          concept_notes: string | null
          core_rank: number | null
          course_id: string | null
          created_at: string
          difficulty: string | null
          exam_traps: string | null
          financial_statements_json: Json | null
          id: string
          important_formulas: string | null
          instruction_1: string | null
          instruction_2: string | null
          instruction_3: string | null
          instruction_4: string | null
          instruction_5: string | null
          instruction_list: string | null
          journal_entry_block: string | null
          journal_entry_completed_json: Json | null
          journal_entry_template_json: Json | null
          problem_context: string | null
          problem_title: string | null
          problem_type: string | null
          source_number: string | null
          source_ref: string | null
          source_type: string | null
          supplementary_je_json: Json | null
          survive_problem_text: string | null
          survive_solution_explanation_cache: Json | null
          survive_solution_json: Json | null
          survive_solution_text: string | null
          t_accounts_json: Json | null
          tables_json: Json | null
          tags: string[] | null
          topic_id: string | null
          updated_at: string
          uses_financial_statements: boolean | null
          uses_t_accounts: boolean | null
          uses_tables: boolean | null
          worked_steps: string | null
        }
        Insert: {
          admin_notes?: Json | null
          asset_approved_at?: string | null
          asset_name?: string | null
          asset_type?: string | null
          chapter_id?: string | null
          concept_notes?: string | null
          core_rank?: number | null
          course_id?: string | null
          created_at?: string
          difficulty?: string | null
          exam_traps?: string | null
          financial_statements_json?: Json | null
          id?: string
          important_formulas?: string | null
          instruction_1?: string | null
          instruction_2?: string | null
          instruction_3?: string | null
          instruction_4?: string | null
          instruction_5?: string | null
          instruction_list?: string | null
          journal_entry_block?: string | null
          journal_entry_completed_json?: Json | null
          journal_entry_template_json?: Json | null
          problem_context?: string | null
          problem_title?: string | null
          problem_type?: string | null
          source_number?: string | null
          source_ref?: string | null
          source_type?: string | null
          supplementary_je_json?: Json | null
          survive_problem_text?: string | null
          survive_solution_explanation_cache?: Json | null
          survive_solution_json?: Json | null
          survive_solution_text?: string | null
          t_accounts_json?: Json | null
          tables_json?: Json | null
          tags?: string[] | null
          topic_id?: string | null
          updated_at?: string
          uses_financial_statements?: boolean | null
          uses_t_accounts?: boolean | null
          uses_tables?: boolean | null
          worked_steps?: string | null
        }
        Update: {
          admin_notes?: Json | null
          asset_approved_at?: string | null
          asset_name?: string | null
          asset_type?: string | null
          chapter_id?: string | null
          concept_notes?: string | null
          core_rank?: number | null
          course_id?: string | null
          created_at?: string
          difficulty?: string | null
          exam_traps?: string | null
          financial_statements_json?: Json | null
          id?: string
          important_formulas?: string | null
          instruction_1?: string | null
          instruction_2?: string | null
          instruction_3?: string | null
          instruction_4?: string | null
          instruction_5?: string | null
          instruction_list?: string | null
          journal_entry_block?: string | null
          journal_entry_completed_json?: Json | null
          journal_entry_template_json?: Json | null
          problem_context?: string | null
          problem_title?: string | null
          problem_type?: string | null
          source_number?: string | null
          source_ref?: string | null
          source_type?: string | null
          supplementary_je_json?: Json | null
          survive_problem_text?: string | null
          survive_solution_explanation_cache?: Json | null
          survive_solution_json?: Json | null
          survive_solution_text?: string | null
          t_accounts_json?: Json | null
          tables_json?: Json | null
          tags?: string[] | null
          topic_id?: string | null
          updated_at?: string
          uses_financial_statements?: boolean | null
          uses_t_accounts?: boolean | null
          uses_tables?: boolean | null
          worked_steps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teaching_assets_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assets_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "chapter_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      textbooks: {
        Row: {
          created_at: string
          edition: string | null
          id: string
          isbn: string | null
          publisher: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          edition?: string | null
          id?: string
          isbn?: string | null
          publisher?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          edition?: string | null
          id?: string
          isbn?: string | null
          publisher?: string | null
          title?: string | null
        }
        Relationships: []
      }
      va_accounts: {
        Row: {
          account_status: string | null
          assigned_chapter_id: string | null
          assigned_course_id: string | null
          completed_at: string | null
          created_at: string
          email: string | null
          first_action_at: string | null
          first_login_at: string | null
          full_name: string | null
          id: string
          last_action_at: string | null
          role: string | null
          test_assigned_at: string | null
          user_id: string | null
        }
        Insert: {
          account_status?: string | null
          assigned_chapter_id?: string | null
          assigned_course_id?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string | null
          first_action_at?: string | null
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          last_action_at?: string | null
          role?: string | null
          test_assigned_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_status?: string | null
          assigned_chapter_id?: string | null
          assigned_course_id?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string | null
          first_action_at?: string | null
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          last_action_at?: string | null
          role?: string | null
          test_assigned_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
