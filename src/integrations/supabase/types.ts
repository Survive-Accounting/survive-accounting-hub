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
      campuses: {
        Row: {
          accounting_department_name: string | null
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
          course_family_titles_json: Json | null
          created_at: string
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
          use_school_colors: boolean | null
          warm_connection_notes: string | null
          website_url: string | null
        }
        Insert: {
          accounting_department_name?: string | null
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
          course_family_titles_json?: Json | null
          created_at?: string
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
          use_school_colors?: boolean | null
          warm_connection_notes?: string | null
          website_url?: string | null
        }
        Update: {
          accounting_department_name?: string | null
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
          course_family_titles_json?: Json | null
          created_at?: string
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
          use_school_colors?: boolean | null
          warm_connection_notes?: string | null
          website_url?: string | null
        }
        Relationships: []
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
          last_message_id: string | null
          last_name: string | null
          notes: string | null
          opens_count: number | null
          replied_at: string | null
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
          last_message_id?: string | null
          last_name?: string | null
          notes?: string | null
          opens_count?: number | null
          replied_at?: string | null
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
          last_message_id?: string | null
          last_name?: string | null
          notes?: string | null
          opens_count?: number | null
          replied_at?: string | null
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
          created_at: string
          id: string
          notes: string | null
          va_account_id: string | null
        }
        Insert: {
          assigned_by_email?: string | null
          assigned_for_date?: string | null
          campus_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          va_account_id?: string | null
        }
        Update: {
          assigned_by_email?: string | null
          assigned_for_date?: string | null
          campus_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
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
          course: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          need_help_with: string | null
          school_id: string | null
        }
        Insert: {
          course?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          need_help_with?: string | null
          school_id?: string | null
        }
        Update: {
          course?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          need_help_with?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_waitlist_signups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "outreach_schools"
            referencedColumns: ["id"]
          },
        ]
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
