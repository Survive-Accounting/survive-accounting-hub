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
      backfill_lock: {
        Row: {
          expires_at: string
          id: string
          owner: string
          updated_at: string
        }
        Insert: {
          expires_at: string
          id: string
          owner: string
          updated_at?: string
        }
        Update: {
          expires_at?: string
          id?: string
          owner?: string
          updated_at?: string
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
      campus_chapter_overrides: {
        Row: {
          campus_id: string
          chapter_id: string
          chapter_label: string | null
          local_number: number | null
          local_order: number | null
          updated_at: string
        }
        Insert: {
          campus_id: string
          chapter_id: string
          chapter_label?: string | null
          local_number?: number | null
          local_order?: number | null
          updated_at?: string
        }
        Update: {
          campus_id?: string
          chapter_id?: string
          chapter_label?: string | null
          local_number?: number | null
          local_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_chapter_overrides_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_chapter_overrides_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_chapter_overrides_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_competitive_intel: {
        Row: {
          ads_observed: boolean | null
          brand_conquest_candidate: boolean | null
          campus_id: string
          competition_intensity: string | null
          competitor_price_context: string | null
          course_code_network_present: boolean | null
          course_specific_competitors: number | null
          evidence_confidence: string | null
          imported_at: string
          intro_accounting_competitors: number | null
          intro_accounting_paid_market_status: string | null
          market_status: string | null
          nonbrand_search_candidate: string | null
          paid_competitors: number | null
          paid_market_status: string | null
          strongest_competitor_course_specific: boolean | null
          strongest_competitor_domain: string | null
          strongest_competitor_name: string | null
          strongest_competitor_type: string | null
          study_edge_present: boolean | null
          top_competitor_domains: string[] | null
          university_free_support: boolean | null
          validated_paid_market: boolean | null
          white_space: boolean | null
        }
        Insert: {
          ads_observed?: boolean | null
          brand_conquest_candidate?: boolean | null
          campus_id: string
          competition_intensity?: string | null
          competitor_price_context?: string | null
          course_code_network_present?: boolean | null
          course_specific_competitors?: number | null
          evidence_confidence?: string | null
          imported_at?: string
          intro_accounting_competitors?: number | null
          intro_accounting_paid_market_status?: string | null
          market_status?: string | null
          nonbrand_search_candidate?: string | null
          paid_competitors?: number | null
          paid_market_status?: string | null
          strongest_competitor_course_specific?: boolean | null
          strongest_competitor_domain?: string | null
          strongest_competitor_name?: string | null
          strongest_competitor_type?: string | null
          study_edge_present?: boolean | null
          top_competitor_domains?: string[] | null
          university_free_support?: boolean | null
          validated_paid_market?: boolean | null
          white_space?: boolean | null
        }
        Update: {
          ads_observed?: boolean | null
          brand_conquest_candidate?: boolean | null
          campus_id?: string
          competition_intensity?: string | null
          competitor_price_context?: string | null
          course_code_network_present?: boolean | null
          course_specific_competitors?: number | null
          evidence_confidence?: string | null
          imported_at?: string
          intro_accounting_competitors?: number | null
          intro_accounting_paid_market_status?: string | null
          market_status?: string | null
          nonbrand_search_candidate?: string | null
          paid_competitors?: number | null
          paid_market_status?: string | null
          strongest_competitor_course_specific?: boolean | null
          strongest_competitor_domain?: string | null
          strongest_competitor_name?: string | null
          strongest_competitor_type?: string | null
          study_edge_present?: boolean | null
          top_competitor_domains?: string[] | null
          university_free_support?: boolean | null
          validated_paid_market?: boolean | null
          white_space?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_competitive_intel_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_competitive_intel_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_context: {
        Row: {
          business_enrollment: number | null
          campus_id: string
          enrollment: number | null
          finals_window: string | null
          football_schedule_url: string | null
          fsl_grade_report_url: string | null
          greek_population_pct: number | null
          midterm_window: string | null
          notes: string | null
          rush_fall_start: string | null
          rush_spring_start: string | null
          semester_end: string | null
          semester_start: string | null
          tuition_in_state: number | null
          tuition_out_state: number | null
          undergrad_enrollment: number | null
          updated_at: string
        }
        Insert: {
          business_enrollment?: number | null
          campus_id: string
          enrollment?: number | null
          finals_window?: string | null
          football_schedule_url?: string | null
          fsl_grade_report_url?: string | null
          greek_population_pct?: number | null
          midterm_window?: string | null
          notes?: string | null
          rush_fall_start?: string | null
          rush_spring_start?: string | null
          semester_end?: string | null
          semester_start?: string | null
          tuition_in_state?: number | null
          tuition_out_state?: number | null
          undergrad_enrollment?: number | null
          updated_at?: string
        }
        Update: {
          business_enrollment?: number | null
          campus_id?: string
          enrollment?: number | null
          finals_window?: string | null
          football_schedule_url?: string | null
          fsl_grade_report_url?: string | null
          greek_population_pct?: number | null
          midterm_window?: string | null
          notes?: string | null
          rush_fall_start?: string | null
          rush_spring_start?: string | null
          semester_end?: string | null
          semester_start?: string | null
          tuition_in_state?: number | null
          tuition_out_state?: number | null
          undergrad_enrollment?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_context_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_context_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_council_contacts: {
        Row: {
          campus_id: string
          confidence: string
          contact_type: string
          council_type: string
          created_at: string
          effective_term: string | null
          email: string | null
          id: string
          instagram_url: string | null
          is_current: boolean | null
          last_verified_at: string | null
          name: string | null
          notes: string | null
          phone: string | null
          retrieved_at: string
          role: string | null
          source_type: string
          source_url: string
          superseded_by: string | null
          website_url: string | null
        }
        Insert: {
          campus_id: string
          confidence?: string
          contact_type?: string
          council_type: string
          created_at?: string
          effective_term?: string | null
          email?: string | null
          id?: string
          instagram_url?: string | null
          is_current?: boolean | null
          last_verified_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          retrieved_at?: string
          role?: string | null
          source_type?: string
          source_url: string
          superseded_by?: string | null
          website_url?: string | null
        }
        Update: {
          campus_id?: string
          confidence?: string
          contact_type?: string
          council_type?: string
          created_at?: string
          effective_term?: string | null
          email?: string | null
          id?: string
          instagram_url?: string | null
          is_current?: boolean | null
          last_verified_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          retrieved_at?: string
          role?: string | null
          source_type?: string
          source_url?: string
          superseded_by?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_council_contacts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_council_contacts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_council_contacts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "campus_council_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_council_status: {
        Row: {
          campus_id: string
          contacts_found: number
          council_type: string
          error: string | null
          id: string
          last_attempted_at: string | null
          last_success_at: string | null
          role_inbox_found: boolean
          status: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          contacts_found?: number
          council_type: string
          error?: string | null
          id?: string
          last_attempted_at?: string | null
          last_success_at?: string | null
          role_inbox_found?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          contacts_found?: number
          council_type?: string
          error?: string | null
          id?: string
          last_attempted_at?: string | null
          last_success_at?: string | null
          role_inbox_found?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_council_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_council_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_course_availability: {
        Row: {
          booking_url: string | null
          campus_id: string | null
          course_family: string | null
          created_at: string | null
          id: string
          notes: string | null
          requires_syllabus_review: string | null
          textbook_match_status: string | null
          tutoring_availability: string | null
          updated_at: string | null
        }
        Insert: {
          booking_url?: string | null
          campus_id?: string | null
          course_family?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          requires_syllabus_review?: string | null
          textbook_match_status?: string | null
          tutoring_availability?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_url?: string | null
          campus_id?: string | null
          course_family?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          requires_syllabus_review?: string | null
          textbook_match_status?: string | null
          tutoring_availability?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      campus_course_sections: {
        Row: {
          campus_id: string | null
          confidence: string | null
          course_code: string | null
          course_family: string | null
          course_title: string | null
          created_at: string | null
          enrollment_capacity: string | null
          enrollment_current: string | null
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
          updated_at: string | null
          waitlist_count: number | null
        }
        Insert: {
          campus_id?: string | null
          confidence?: string | null
          course_code?: string | null
          course_family?: string | null
          course_title?: string | null
          created_at?: string | null
          enrollment_capacity?: string | null
          enrollment_current?: string | null
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
          updated_at?: string | null
          waitlist_count?: number | null
        }
        Update: {
          campus_id?: string | null
          confidence?: string | null
          course_code?: string | null
          course_family?: string | null
          course_title?: string | null
          created_at?: string | null
          enrollment_capacity?: string | null
          enrollment_current?: string | null
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
          updated_at?: string | null
          waitlist_count?: number | null
        }
        Relationships: []
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
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
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
      campus_exam_dates: {
        Row: {
          campus_id: string
          course_code: string | null
          created_at: string
          exam: number
          exam_date: string
          id: string
          source: string | null
        }
        Insert: {
          campus_id: string
          course_code?: string | null
          created_at?: string
          exam: number
          exam_date: string
          id?: string
          source?: string | null
        }
        Update: {
          campus_id?: string
          course_code?: string | null
          created_at?: string
          exam?: number
          exam_date?: string
          id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_exam_dates_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_exam_dates_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_exam_topics: {
        Row: {
          campus_exam_id: string
          chapter_id: string
          position: number | null
          source_file_id: string | null
        }
        Insert: {
          campus_exam_id: string
          chapter_id: string
          position?: number | null
          source_file_id?: string | null
        }
        Update: {
          campus_exam_id?: string
          chapter_id?: string
          position?: number | null
          source_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_exam_topics_campus_exam_id_fkey"
            columns: ["campus_exam_id"]
            isOneToOne: false
            referencedRelation: "campus_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_exam_topics_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_exams: {
        Row: {
          campus_id: string | null
          course_id: string
          coverage_pct: number
          created_at: string
          id: string
          name: string
          position: number | null
          professor_id: string | null
          status: string
        }
        Insert: {
          campus_id?: string | null
          course_id: string
          coverage_pct?: number
          created_at?: string
          id?: string
          name: string
          position?: number | null
          professor_id?: string | null
          status?: string
        }
        Update: {
          campus_id?: string | null
          course_id?: string
          coverage_pct?: number
          created_at?: string
          id?: string
          name?: string
          position?: number | null
          professor_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_exams_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_exams_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_greek_chapters: {
        Row: {
          address: string | null
          advisor_name: string | null
          advisor_notes: string | null
          archived_at: string | null
          as_of: string | null
          campus_id: string | null
          chapter_designation: string | null
          chapter_size: number | null
          chapter_url: string | null
          chartered_year: number | null
          claim_status: string
          claimed_at: string | null
          confidence: string | null
          council: string | null
          council_raw: string | null
          county_assessor_url: string | null
          created_at: string | null
          discovery_source: string | null
          ein: string | null
          enrichment_note: string | null
          enrichment_status: string
          exec_page_url: string | null
          facebook_url: string | null
          gpa: number | null
          gpa_history: Json | null
          gpa_year: number | null
          greek_org_id: string | null
          greek_rank: string | null
          house_corp_990_url: string | null
          house_corp_name: string | null
          id: string
          instagram_url: string | null
          is_founding_chapter: boolean
          is_national_org: boolean | null
          letters: string | null
          mailing_address: string | null
          needs_verification: boolean | null
          nickname: string | null
          notes: string | null
          on_probation: boolean | null
          parcel_value_building: number | null
          parcel_value_land: number | null
          phone: string | null
          propublica_url: string | null
          public_notes: string | null
          research_meta: Json | null
          research_source: string | null
          roster_status: string
          slug: string | null
          source_url: string | null
          square_footage: number | null
          status: string | null
          tiktok_url: string | null
          trending_down: boolean | null
          updated_at: string | null
          verified: boolean
          website_url: string | null
          year_built: number | null
        }
        Insert: {
          address?: string | null
          advisor_name?: string | null
          advisor_notes?: string | null
          archived_at?: string | null
          as_of?: string | null
          campus_id?: string | null
          chapter_designation?: string | null
          chapter_size?: number | null
          chapter_url?: string | null
          chartered_year?: number | null
          claim_status?: string
          claimed_at?: string | null
          confidence?: string | null
          council?: string | null
          council_raw?: string | null
          county_assessor_url?: string | null
          created_at?: string | null
          discovery_source?: string | null
          ein?: string | null
          enrichment_note?: string | null
          enrichment_status?: string
          exec_page_url?: string | null
          facebook_url?: string | null
          gpa?: number | null
          gpa_history?: Json | null
          gpa_year?: number | null
          greek_org_id?: string | null
          greek_rank?: string | null
          house_corp_990_url?: string | null
          house_corp_name?: string | null
          id?: string
          instagram_url?: string | null
          is_founding_chapter?: boolean
          is_national_org?: boolean | null
          letters?: string | null
          mailing_address?: string | null
          needs_verification?: boolean | null
          nickname?: string | null
          notes?: string | null
          on_probation?: boolean | null
          parcel_value_building?: number | null
          parcel_value_land?: number | null
          phone?: string | null
          propublica_url?: string | null
          public_notes?: string | null
          research_meta?: Json | null
          research_source?: string | null
          roster_status?: string
          slug?: string | null
          source_url?: string | null
          square_footage?: number | null
          status?: string | null
          tiktok_url?: string | null
          trending_down?: boolean | null
          updated_at?: string | null
          verified?: boolean
          website_url?: string | null
          year_built?: number | null
        }
        Update: {
          address?: string | null
          advisor_name?: string | null
          advisor_notes?: string | null
          archived_at?: string | null
          as_of?: string | null
          campus_id?: string | null
          chapter_designation?: string | null
          chapter_size?: number | null
          chapter_url?: string | null
          chartered_year?: number | null
          claim_status?: string
          claimed_at?: string | null
          confidence?: string | null
          council?: string | null
          council_raw?: string | null
          county_assessor_url?: string | null
          created_at?: string | null
          discovery_source?: string | null
          ein?: string | null
          enrichment_note?: string | null
          enrichment_status?: string
          exec_page_url?: string | null
          facebook_url?: string | null
          gpa?: number | null
          gpa_history?: Json | null
          gpa_year?: number | null
          greek_org_id?: string | null
          greek_rank?: string | null
          house_corp_990_url?: string | null
          house_corp_name?: string | null
          id?: string
          instagram_url?: string | null
          is_founding_chapter?: boolean
          is_national_org?: boolean | null
          letters?: string | null
          mailing_address?: string | null
          needs_verification?: boolean | null
          nickname?: string | null
          notes?: string | null
          on_probation?: boolean | null
          parcel_value_building?: number | null
          parcel_value_land?: number | null
          phone?: string | null
          propublica_url?: string | null
          public_notes?: string | null
          research_meta?: Json | null
          research_source?: string | null
          roster_status?: string
          slug?: string | null
          source_url?: string | null
          square_footage?: number | null
          status?: string | null
          tiktok_url?: string | null
          trending_down?: boolean | null
          updated_at?: string | null
          verified?: boolean
          website_url?: string | null
          year_built?: number | null
        }
        Relationships: []
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
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
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
          activated_at: string | null
          active_roster: string | null
          archive_label: string | null
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          campus_id: string | null
          chapter_id: string | null
          confidence: string | null
          courses_found: string | null
          created_at: string | null
          department: string | null
          email: string | null
          first_name: string | null
          hasselback_areas: string | null
          hasselback_match: boolean | null
          hasselback_tenured: boolean | null
          id: string
          is_cpa: boolean | null
          is_phd: boolean | null
          last_name: string | null
          lead_type: string | null
          mobility_note: string | null
          mobility_status: string
          mobility_updated_at: string | null
          moved_to_campus_id: string | null
          moved_to_lead_id: string | null
          notes: string | null
          position: string | null
          profintel_reason: string | null
          profintel_score: number | null
          profintel_v2_status: string | null
          raw_payload: Json | null
          research_label: string | null
          research_mode: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rmp_checked_at: string | null
          rmp_course_codes: string[] | null
          rmp_course_match_count: number | null
          rmp_course_match_json: Json | null
          rmp_difficulty: number | null
          rmp_latest_target_course_code: string | null
          rmp_latest_target_rating_date: string | null
          rmp_num_ratings: string | null
          rmp_profile_url: string | null
          rmp_rating: number | null
          rmp_recent_target_match: boolean | null
          rmp_target_confidence: string | null
          rmp_target_course_counts_json: Json | null
          rmp_taught_this_time_last_year: boolean | null
          rmp_terms_taught_estimate_json: Json | null
          rmp_would_take_again: string | null
          source: string | null
          source_url: string | null
          status: string | null
          student_visible: boolean
          teaches_intermediate_1: string | null
          teaches_intermediate_2: string | null
          teaches_intro_1: string | null
          teaches_intro_2: string | null
          teaching_confidence: string | null
          teaching_evidence_notes: string | null
          teaching_evidence_url: string | null
          teaching_signals: Json | null
          term: string | null
          title: string | null
          title_tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          active_roster?: string | null
          archive_label?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          campus_id?: string | null
          chapter_id?: string | null
          confidence?: string | null
          courses_found?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          first_name?: string | null
          hasselback_areas?: string | null
          hasselback_match?: boolean | null
          hasselback_tenured?: boolean | null
          id?: string
          is_cpa?: boolean | null
          is_phd?: boolean | null
          last_name?: string | null
          lead_type?: string | null
          mobility_note?: string | null
          mobility_status?: string
          mobility_updated_at?: string | null
          moved_to_campus_id?: string | null
          moved_to_lead_id?: string | null
          notes?: string | null
          position?: string | null
          profintel_reason?: string | null
          profintel_score?: number | null
          profintel_v2_status?: string | null
          raw_payload?: Json | null
          research_label?: string | null
          research_mode?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rmp_checked_at?: string | null
          rmp_course_codes?: string[] | null
          rmp_course_match_count?: number | null
          rmp_course_match_json?: Json | null
          rmp_difficulty?: number | null
          rmp_latest_target_course_code?: string | null
          rmp_latest_target_rating_date?: string | null
          rmp_num_ratings?: string | null
          rmp_profile_url?: string | null
          rmp_rating?: number | null
          rmp_recent_target_match?: boolean | null
          rmp_target_confidence?: string | null
          rmp_target_course_counts_json?: Json | null
          rmp_taught_this_time_last_year?: boolean | null
          rmp_terms_taught_estimate_json?: Json | null
          rmp_would_take_again?: string | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          student_visible?: boolean
          teaches_intermediate_1?: string | null
          teaches_intermediate_2?: string | null
          teaches_intro_1?: string | null
          teaches_intro_2?: string | null
          teaching_confidence?: string | null
          teaching_evidence_notes?: string | null
          teaching_evidence_url?: string | null
          teaching_signals?: Json | null
          term?: string | null
          title?: string | null
          title_tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          active_roster?: string | null
          archive_label?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          campus_id?: string | null
          chapter_id?: string | null
          confidence?: string | null
          courses_found?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          first_name?: string | null
          hasselback_areas?: string | null
          hasselback_match?: boolean | null
          hasselback_tenured?: boolean | null
          id?: string
          is_cpa?: boolean | null
          is_phd?: boolean | null
          last_name?: string | null
          lead_type?: string | null
          mobility_note?: string | null
          mobility_status?: string
          mobility_updated_at?: string | null
          moved_to_campus_id?: string | null
          moved_to_lead_id?: string | null
          notes?: string | null
          position?: string | null
          profintel_reason?: string | null
          profintel_score?: number | null
          profintel_v2_status?: string | null
          raw_payload?: Json | null
          research_label?: string | null
          research_mode?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rmp_checked_at?: string | null
          rmp_course_codes?: string[] | null
          rmp_course_match_count?: number | null
          rmp_course_match_json?: Json | null
          rmp_difficulty?: number | null
          rmp_latest_target_course_code?: string | null
          rmp_latest_target_rating_date?: string | null
          rmp_num_ratings?: string | null
          rmp_profile_url?: string | null
          rmp_rating?: number | null
          rmp_recent_target_match?: boolean | null
          rmp_target_confidence?: string | null
          rmp_target_course_counts_json?: Json | null
          rmp_taught_this_time_last_year?: boolean | null
          rmp_terms_taught_estimate_json?: Json | null
          rmp_would_take_again?: string | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          student_visible?: boolean
          teaches_intermediate_1?: string | null
          teaches_intermediate_2?: string | null
          teaches_intro_1?: string | null
          teaches_intro_2?: string | null
          teaching_confidence?: string | null
          teaching_evidence_notes?: string | null
          teaching_evidence_url?: string | null
          teaching_signals?: Json | null
          term?: string | null
          title?: string | null
          title_tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_lead_suggestions_moved_to_campus_id_fkey"
            columns: ["moved_to_campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_lead_suggestions_moved_to_campus_id_fkey"
            columns: ["moved_to_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_market_intelligence: {
        Row: {
          accounting_bachelors: number | null
          accounting_growth_5y: number | null
          accounting_share_of_business: number | null
          action_suppress_reason: string | null
          action_suppressed: boolean | null
          business_5y_cagr: number | null
          business_bachelors: number | null
          business_growth_1y: number | null
          business_growth_3y: number | null
          business_growth_5y: number | null
          business_series: Json | null
          business_share_change_3y: number | null
          business_share_change_5y: number | null
          business_share_of_bachelors: number | null
          campus_id: string
          club_available: boolean | null
          config_version: string
          council_available: boolean | null
          council_contacts_councils: number | null
          councils_present: string[] | null
          course_readiness_score: number | null
          course_readiness_status: string | null
          current_action_priority: number | null
          distribution_data_completeness: number | null
          distribution_strength_score: number | null
          duplicate_unitid: boolean | null
          enrichment_priority_score: number | null
          estimated_intro1_annual: number | null
          first_party_signal_count: number | null
          generated_at: string
          greek_available: boolean | null
          greek_chapters: number | null
          growth_label: string | null
          growth_momentum_score: number | null
          growth_status: string | null
          has_finance_club: boolean | null
          has_women_in_business: boolean | null
          institution_level: string | null
          intro1_estimate_confidence: string | null
          intro1_estimate_method: string | null
          ipeds_name: string | null
          ipeds_unitid: string | null
          latest_data_year: number | null
          live_demand_score: number | null
          live_demand_status: string | null
          market_data_completeness: number | null
          market_opportunity_score: number | null
          match_confidence: number | null
          match_method: string | null
          meaningful_market: boolean | null
          new_program: boolean | null
          outreach_priority_score: number | null
          outreach_priority_version: string | null
          raw_json: Json | null
          recommended_next_action: string | null
          role_inbox_councils: number | null
          run_id: string | null
          score_components: Json | null
          segment: string | null
          structural_completeness: number | null
          top_drivers: Json | null
          total_bachelors: number | null
          undergrad_enrollment: number | null
          undergrad_growth_5y: number | null
          updated_at: string
        }
        Insert: {
          accounting_bachelors?: number | null
          accounting_growth_5y?: number | null
          accounting_share_of_business?: number | null
          action_suppress_reason?: string | null
          action_suppressed?: boolean | null
          business_5y_cagr?: number | null
          business_bachelors?: number | null
          business_growth_1y?: number | null
          business_growth_3y?: number | null
          business_growth_5y?: number | null
          business_series?: Json | null
          business_share_change_3y?: number | null
          business_share_change_5y?: number | null
          business_share_of_bachelors?: number | null
          campus_id: string
          club_available?: boolean | null
          config_version: string
          council_available?: boolean | null
          council_contacts_councils?: number | null
          councils_present?: string[] | null
          course_readiness_score?: number | null
          course_readiness_status?: string | null
          current_action_priority?: number | null
          distribution_data_completeness?: number | null
          distribution_strength_score?: number | null
          duplicate_unitid?: boolean | null
          enrichment_priority_score?: number | null
          estimated_intro1_annual?: number | null
          first_party_signal_count?: number | null
          generated_at?: string
          greek_available?: boolean | null
          greek_chapters?: number | null
          growth_label?: string | null
          growth_momentum_score?: number | null
          growth_status?: string | null
          has_finance_club?: boolean | null
          has_women_in_business?: boolean | null
          institution_level?: string | null
          intro1_estimate_confidence?: string | null
          intro1_estimate_method?: string | null
          ipeds_name?: string | null
          ipeds_unitid?: string | null
          latest_data_year?: number | null
          live_demand_score?: number | null
          live_demand_status?: string | null
          market_data_completeness?: number | null
          market_opportunity_score?: number | null
          match_confidence?: number | null
          match_method?: string | null
          meaningful_market?: boolean | null
          new_program?: boolean | null
          outreach_priority_score?: number | null
          outreach_priority_version?: string | null
          raw_json?: Json | null
          recommended_next_action?: string | null
          role_inbox_councils?: number | null
          run_id?: string | null
          score_components?: Json | null
          segment?: string | null
          structural_completeness?: number | null
          top_drivers?: Json | null
          total_bachelors?: number | null
          undergrad_enrollment?: number | null
          undergrad_growth_5y?: number | null
          updated_at?: string
        }
        Update: {
          accounting_bachelors?: number | null
          accounting_growth_5y?: number | null
          accounting_share_of_business?: number | null
          action_suppress_reason?: string | null
          action_suppressed?: boolean | null
          business_5y_cagr?: number | null
          business_bachelors?: number | null
          business_growth_1y?: number | null
          business_growth_3y?: number | null
          business_growth_5y?: number | null
          business_series?: Json | null
          business_share_change_3y?: number | null
          business_share_change_5y?: number | null
          business_share_of_bachelors?: number | null
          campus_id?: string
          club_available?: boolean | null
          config_version?: string
          council_available?: boolean | null
          council_contacts_councils?: number | null
          councils_present?: string[] | null
          course_readiness_score?: number | null
          course_readiness_status?: string | null
          current_action_priority?: number | null
          distribution_data_completeness?: number | null
          distribution_strength_score?: number | null
          duplicate_unitid?: boolean | null
          enrichment_priority_score?: number | null
          estimated_intro1_annual?: number | null
          first_party_signal_count?: number | null
          generated_at?: string
          greek_available?: boolean | null
          greek_chapters?: number | null
          growth_label?: string | null
          growth_momentum_score?: number | null
          growth_status?: string | null
          has_finance_club?: boolean | null
          has_women_in_business?: boolean | null
          institution_level?: string | null
          intro1_estimate_confidence?: string | null
          intro1_estimate_method?: string | null
          ipeds_name?: string | null
          ipeds_unitid?: string | null
          latest_data_year?: number | null
          live_demand_score?: number | null
          live_demand_status?: string | null
          market_data_completeness?: number | null
          market_opportunity_score?: number | null
          match_confidence?: number | null
          match_method?: string | null
          meaningful_market?: boolean | null
          new_program?: boolean | null
          outreach_priority_score?: number | null
          outreach_priority_version?: string | null
          raw_json?: Json | null
          recommended_next_action?: string | null
          role_inbox_councils?: number | null
          run_id?: string | null
          score_components?: Json | null
          segment?: string | null
          structural_completeness?: number | null
          top_drivers?: Json | null
          total_bachelors?: number | null
          undergrad_enrollment?: number | null
          undergrad_growth_5y?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_market_intelligence_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_market_intelligence_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_market_intelligence_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "market_intel_runs"
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
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_phone_numbers_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_rep_applications: {
        Row: {
          created_at: string
          email: string
          greek_org: string | null
          id: string
          name: string
          note: string | null
          phone: string
          pitch: string | null
          school_name: string
          school_slug: string
          status: string
          updated_at: string
          work_authorized: boolean
          year_in_school: string | null
        }
        Insert: {
          created_at?: string
          email: string
          greek_org?: string | null
          id?: string
          name: string
          note?: string | null
          phone: string
          pitch?: string | null
          school_name: string
          school_slug: string
          status?: string
          updated_at?: string
          work_authorized?: boolean
          year_in_school?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          greek_org?: string | null
          id?: string
          name?: string
          note?: string | null
          phone?: string
          pitch?: string | null
          school_name?: string
          school_slug?: string
          status?: string
          updated_at?: string
          work_authorized?: boolean
          year_in_school?: string | null
        }
        Relationships: []
      }
      campus_research_job_items: {
        Row: {
          campus_id: string | null
          created_at: string | null
          current_step: string | null
          error: string | null
          failed_step: string | null
          families_with_zero: string | null
          finished_at: string | null
          id: string
          job_id: string | null
          leads_count: number | null
          profile_done: string | null
          retries: string | null
          sections_count: number | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          campus_id?: string | null
          created_at?: string | null
          current_step?: string | null
          error?: string | null
          failed_step?: string | null
          families_with_zero?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string | null
          leads_count?: number | null
          profile_done?: string | null
          retries?: string | null
          sections_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          campus_id?: string | null
          created_at?: string | null
          current_step?: string | null
          error?: string | null
          failed_step?: string | null
          families_with_zero?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string | null
          leads_count?: number | null
          profile_done?: string | null
          retries?: string | null
          sections_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      campus_research_jobs: {
        Row: {
          created_at: string | null
          done_count: number | null
          failed_count: number | null
          finished_at: string | null
          id: string
          notes: string | null
          options: string | null
          research_mode: string | null
          status: string | null
          total_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          done_count?: number | null
          failed_count?: number | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          options?: string | null
          research_mode?: string | null
          status?: string | null
          total_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          done_count?: number | null
          failed_count?: number | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          options?: string | null
          research_mode?: string | null
          status?: string | null
          total_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      campus_spirit: {
        Row: {
          campus_id: string
          chant: string | null
          greeting: string | null
          mascot: string | null
          primary_hex: string | null
          secondary_hex: string | null
          tertiary_hex: string | null
          updated_at: string | null
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          campus_id: string
          chant?: string | null
          greeting?: string | null
          mascot?: string | null
          primary_hex?: string | null
          secondary_hex?: string | null
          tertiary_hex?: string | null
          updated_at?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          campus_id?: string
          chant?: string | null
          greeting?: string | null
          mascot?: string | null
          primary_hex?: string | null
          secondary_hex?: string | null
          tertiary_hex?: string | null
          updated_at?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_spirit_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_spirit_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_systems: {
        Row: {
          aliases: Json
          created_at: string
          id: string
          name: string
        }
        Insert: {
          aliases?: Json
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          aliases?: Json
          created_at?: string
          id?: string
          name?: string
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
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
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
          accounting_major: string | null
          campus_id: string | null
          campus_text: string | null
          channel: string | null
          chapter: string | null
          consent_sms_at: string | null
          contacted_at: string | null
          course_code: string | null
          course_text: string | null
          created_at: string
          email: string | null
          exam: number | null
          file_paths: string[] | null
          id: string
          is_test: boolean
          kind: string | null
          legacy_id: string | null
          legacy_table: string | null
          name: string | null
          note: string | null
          phone: string | null
          professor: string | null
          source: string | null
          source_path: string | null
          tier_interest: string | null
          topic: string | null
          wants_call: boolean
          wants_text: boolean
        }
        Insert: {
          accounting_major?: string | null
          campus_id?: string | null
          campus_text?: string | null
          channel?: string | null
          chapter?: string | null
          consent_sms_at?: string | null
          contacted_at?: string | null
          course_code?: string | null
          course_text?: string | null
          created_at?: string
          email?: string | null
          exam?: number | null
          file_paths?: string[] | null
          id?: string
          is_test?: boolean
          kind?: string | null
          legacy_id?: string | null
          legacy_table?: string | null
          name?: string | null
          note?: string | null
          phone?: string | null
          professor?: string | null
          source?: string | null
          source_path?: string | null
          tier_interest?: string | null
          topic?: string | null
          wants_call?: boolean
          wants_text?: boolean
        }
        Update: {
          accounting_major?: string | null
          campus_id?: string | null
          campus_text?: string | null
          channel?: string | null
          chapter?: string | null
          consent_sms_at?: string | null
          contacted_at?: string | null
          course_code?: string | null
          course_text?: string | null
          created_at?: string
          email?: string | null
          exam?: number | null
          file_paths?: string[] | null
          id?: string
          is_test?: boolean
          kind?: string | null
          legacy_id?: string | null
          legacy_table?: string | null
          name?: string | null
          note?: string | null
          phone?: string | null
          professor?: string | null
          source?: string | null
          source_path?: string | null
          tier_interest?: string | null
          topic?: string | null
          wants_call?: boolean
          wants_text?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campus_waitlist_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "campus_waitlist_campus_id_fkey"
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
          accounting_department_url: string | null
          active_roster: string | null
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
          aliases: Json
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
          bap_chapter_designation: string | null
          bap_checked_at: string | null
          best_contact_type: string | null
          business_school_name: string | null
          campaign_priority_factors: Json | null
          campaign_priority_score: number | null
          campus_resolution_status: string | null
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
          display_name: string | null
          domains: string[] | null
          due_date: string | null
          email_domain: string | null
          enriched_at: string | null
          enrichment_confidence_notes: string | null
          enrollment_source: string | null
          enrollment_source_year: string | null
          enrollment_updated_at: string | null
          faculty_page_url: string | null
          faculty_scrape_cache: Json | null
          fsl_url: string | null
          generated_theme_json: Json | null
          greek_density_source: string | null
          greek_eligibility: string | null
          greek_eligibility_checked_at: string | null
          greek_pct_fraternity: number | null
          greek_pct_sorority: number | null
          has_bachelors_accounting: boolean | null
          has_bap_chapter: boolean | null
          has_masters_accounting: boolean | null
          has_phd_accounting: boolean | null
          hipolabs_raw_json: Json | null
          hipolabs_status: string | null
          id: string
          institution_name: string | null
          institution_type: string | null
          international: boolean | null
          ipeds_unitid: number | null
          is_active: boolean | null
          is_research_only: boolean
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
          mascot_verified: boolean
          name: string | null
          next_action: string | null
          outreach_notes: string | null
          outreach_status: string | null
          parent_system_id: string | null
          preview_slug: string | null
          priority_score: number | null
          priority_tier: string | null
          program_levels_evidence: Json | null
          program_shorthand: string | null
          ready_for_outreach: boolean | null
          region: string | null
          review_notes: string | null
          rmp_last_checked_at: string | null
          rmp_match_confidence: number | null
          rmp_match_notes: string | null
          rmp_match_status: string | null
          rmp_page_url: string | null
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
          subreddit_verified: boolean
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
          use_personal_phone: boolean | null
          use_school_colors: boolean | null
          warm_connection_notes: string | null
          website_url: string | null
        }
        Insert: {
          accounting_department_name?: string | null
          accounting_department_url?: string | null
          active_roster?: string | null
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
          aliases?: Json
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
          bap_chapter_designation?: string | null
          bap_checked_at?: string | null
          best_contact_type?: string | null
          business_school_name?: string | null
          campaign_priority_factors?: Json | null
          campaign_priority_score?: number | null
          campus_resolution_status?: string | null
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
          display_name?: string | null
          domains?: string[] | null
          due_date?: string | null
          email_domain?: string | null
          enriched_at?: string | null
          enrichment_confidence_notes?: string | null
          enrollment_source?: string | null
          enrollment_source_year?: string | null
          enrollment_updated_at?: string | null
          faculty_page_url?: string | null
          faculty_scrape_cache?: Json | null
          fsl_url?: string | null
          generated_theme_json?: Json | null
          greek_density_source?: string | null
          greek_eligibility?: string | null
          greek_eligibility_checked_at?: string | null
          greek_pct_fraternity?: number | null
          greek_pct_sorority?: number | null
          has_bachelors_accounting?: boolean | null
          has_bap_chapter?: boolean | null
          has_masters_accounting?: boolean | null
          has_phd_accounting?: boolean | null
          hipolabs_raw_json?: Json | null
          hipolabs_status?: string | null
          id?: string
          institution_name?: string | null
          institution_type?: string | null
          international?: boolean | null
          ipeds_unitid?: number | null
          is_active?: boolean | null
          is_research_only?: boolean
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
          mascot_verified?: boolean
          name?: string | null
          next_action?: string | null
          outreach_notes?: string | null
          outreach_status?: string | null
          parent_system_id?: string | null
          preview_slug?: string | null
          priority_score?: number | null
          priority_tier?: string | null
          program_levels_evidence?: Json | null
          program_shorthand?: string | null
          ready_for_outreach?: boolean | null
          region?: string | null
          review_notes?: string | null
          rmp_last_checked_at?: string | null
          rmp_match_confidence?: number | null
          rmp_match_notes?: string | null
          rmp_match_status?: string | null
          rmp_page_url?: string | null
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
          subreddit_verified?: boolean
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
          use_personal_phone?: boolean | null
          use_school_colors?: boolean | null
          warm_connection_notes?: string | null
          website_url?: string | null
        }
        Update: {
          accounting_department_name?: string | null
          accounting_department_url?: string | null
          active_roster?: string | null
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
          aliases?: Json
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
          bap_chapter_designation?: string | null
          bap_checked_at?: string | null
          best_contact_type?: string | null
          business_school_name?: string | null
          campaign_priority_factors?: Json | null
          campaign_priority_score?: number | null
          campus_resolution_status?: string | null
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
          display_name?: string | null
          domains?: string[] | null
          due_date?: string | null
          email_domain?: string | null
          enriched_at?: string | null
          enrichment_confidence_notes?: string | null
          enrollment_source?: string | null
          enrollment_source_year?: string | null
          enrollment_updated_at?: string | null
          faculty_page_url?: string | null
          faculty_scrape_cache?: Json | null
          fsl_url?: string | null
          generated_theme_json?: Json | null
          greek_density_source?: string | null
          greek_eligibility?: string | null
          greek_eligibility_checked_at?: string | null
          greek_pct_fraternity?: number | null
          greek_pct_sorority?: number | null
          has_bachelors_accounting?: boolean | null
          has_bap_chapter?: boolean | null
          has_masters_accounting?: boolean | null
          has_phd_accounting?: boolean | null
          hipolabs_raw_json?: Json | null
          hipolabs_status?: string | null
          id?: string
          institution_name?: string | null
          institution_type?: string | null
          international?: boolean | null
          ipeds_unitid?: number | null
          is_active?: boolean | null
          is_research_only?: boolean
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
          mascot_verified?: boolean
          name?: string | null
          next_action?: string | null
          outreach_notes?: string | null
          outreach_status?: string | null
          parent_system_id?: string | null
          preview_slug?: string | null
          priority_score?: number | null
          priority_tier?: string | null
          program_levels_evidence?: Json | null
          program_shorthand?: string | null
          ready_for_outreach?: boolean | null
          region?: string | null
          review_notes?: string | null
          rmp_last_checked_at?: string | null
          rmp_match_confidence?: number | null
          rmp_match_notes?: string | null
          rmp_match_status?: string | null
          rmp_page_url?: string | null
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
          subreddit_verified?: boolean
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
          use_personal_phone?: boolean | null
          use_school_colors?: boolean | null
          warm_connection_notes?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campuses_parent_system_id_fkey"
            columns: ["parent_system_id"]
            isOneToOne: false
            referencedRelation: "campus_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_decks: {
        Row: {
          created_at: string
          filter: string | null
          id: string
          lesson_id: string | null
          name: string
          payload_type: string
          run_mode: string
          show_skeletons: boolean
          slots_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          filter?: string | null
          id?: string
          lesson_id?: string | null
          name: string
          payload_type?: string
          run_mode?: string
          show_skeletons?: boolean
          slots_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          filter?: string | null
          id?: string
          lesson_id?: string | null
          name?: string
          payload_type?: string
          run_mode?: string
          show_skeletons?: boolean
          slots_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      canvas_folders: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          name: string
          sort?: number
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "canvas_folders_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_scene_snapshots: {
        Row: {
          bg: string | null
          id: string
          label: string | null
          nodes_json: Json
          scene_id: string
          taken_at: string
          viewport_json: Json | null
        }
        Insert: {
          bg?: string | null
          id?: string
          label?: string | null
          nodes_json: Json
          scene_id: string
          taken_at?: string
          viewport_json?: Json | null
        }
        Update: {
          bg?: string | null
          id?: string
          label?: string | null
          nodes_json?: Json
          scene_id?: string
          taken_at?: string
          viewport_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_scene_snapshots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "canvas_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_scenes: {
        Row: {
          bg: string
          chapter_id: string | null
          created_at: string
          folder_id: string | null
          id: string
          name: string
          nodes_json: Json
          updated_at: string
          viewport_json: Json
          waypoints_json: Json | null
        }
        Insert: {
          bg?: string
          chapter_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          name: string
          nodes_json?: Json
          updated_at?: string
          viewport_json?: Json
          waypoints_json?: Json | null
        }
        Update: {
          bg?: string
          chapter_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          name?: string
          nodes_json?: Json
          updated_at?: string
          viewport_json?: Json
          waypoints_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_scenes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_scenes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "canvas_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_sfx: {
        Row: {
          config: Json
          id: number
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      canvas_snippets: {
        Row: {
          created_at: string
          id: string
          name: string
          payload_json: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          payload_json: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          payload_json?: Json
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
      ceq_dictation_segments: {
        Row: {
          content: string | null
          created_at: string
          id: string
          resource_id: string | null
          resource_type: string | null
          session_id: string
          sort_order: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          resource_id?: string | null
          resource_type?: string | null
          session_id: string
          sort_order?: number
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "ceq_dictation_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ceq_dictation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ceq_dictation_sessions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ceq_teaching_blocks: {
        Row: {
          block_type: string | null
          body: string | null
          chapter_id: string | null
          created_at: string
          id: string
          payload: Json | null
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
          payload?: Json | null
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
          payload?: Json | null
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
      chapter_gpa: {
        Row: {
          campus_rank: number | null
          created_at: string
          gpa: number | null
          greek_org_id: string | null
          id: string
          member_count: number | null
          source_url: string | null
          term: string | null
        }
        Insert: {
          campus_rank?: number | null
          created_at?: string
          gpa?: number | null
          greek_org_id?: string | null
          id?: string
          member_count?: number | null
          source_url?: string | null
          term?: string | null
        }
        Update: {
          campus_rank?: number | null
          created_at?: string
          gpa?: number | null
          greek_org_id?: string | null
          id?: string
          member_count?: number | null
          source_url?: string | null
          term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_gpa_greek_org_id_fkey"
            columns: ["greek_org_id"]
            isOneToOne: false
            referencedRelation: "greek_orgs"
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
      chapter_seat_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          chapter_id: string
          created_at: string
          entitlement_id: string | null
          id: string
          is_test: boolean
          member_email: string | null
          member_id: string | null
          pool_id: string
          released_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          chapter_id: string
          created_at?: string
          entitlement_id?: string | null
          id?: string
          is_test?: boolean
          member_email?: string | null
          member_id?: string | null
          pool_id: string
          released_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          chapter_id?: string
          created_at?: string
          entitlement_id?: string | null
          id?: string
          is_test?: boolean
          member_email?: string | null
          member_id?: string | null
          pool_id?: string
          released_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_seat_assignments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "greek_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_seat_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "greek_chapter_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_seat_assignments_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "chapter_seat_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_seat_pools: {
        Row: {
          activated_at: string | null
          amount_cents: number
          chapter_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          invoice_number: string | null
          invoice_status: string | null
          invoice_url: string | null
          is_test: boolean
          note: string | null
          payment_method: string | null
          seats_total: number
          starts_at: string
          status: string
          stripe_checkout_id: string | null
          stripe_invoice_id: string | null
          term_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          amount_cents?: number
          chapter_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          invoice_number?: string | null
          invoice_status?: string | null
          invoice_url?: string | null
          is_test?: boolean
          note?: string | null
          payment_method?: string | null
          seats_total: number
          starts_at: string
          status?: string
          stripe_checkout_id?: string | null
          stripe_invoice_id?: string | null
          term_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          amount_cents?: number
          chapter_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          invoice_number?: string | null
          invoice_status?: string | null
          invoice_url?: string | null
          is_test?: boolean
          note?: string | null
          payment_method?: string | null
          seats_total?: number
          starts_at?: string
          status?: string
          stripe_checkout_id?: string | null
          stripe_invoice_id?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_seat_pools_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_share_events: {
        Row: {
          actor: string | null
          chapter_id: string
          created_at: string
          id: string
          is_test: boolean
          kind: string
          term_id: string | null
        }
        Insert: {
          actor?: string | null
          chapter_id: string
          created_at?: string
          id?: string
          is_test?: boolean
          kind: string
          term_id?: string | null
        }
        Update: {
          actor?: string | null
          chapter_id?: string
          created_at?: string
          id?: string
          is_test?: boolean
          kind?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_share_events_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "greek_chapters"
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
          parked: boolean
          short_label: string | null
          source_file_id: string | null
          status: string
          subtitle: string | null
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
          parked?: boolean
          short_label?: string | null
          source_file_id?: string | null
          status?: string
          subtitle?: string | null
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
          parked?: boolean
          short_label?: string | null
          source_file_id?: string | null
          status?: string
          subtitle?: string | null
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
      comms_broadcasts: {
        Row: {
          created_at: string
          created_by: string | null
          exam: number | null
          id: string
          is_test: boolean
          recipient_count: number
          sent_count: number
          subject: string
          topic: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exam?: number | null
          id?: string
          is_test?: boolean
          recipient_count?: number
          sent_count?: number
          subject: string
          topic?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exam?: number | null
          id?: string
          is_test?: boolean
          recipient_count?: number
          sent_count?: number
          subject?: string
          topic?: string | null
        }
        Relationships: []
      }
      comms_contacts: {
        Row: {
          created_at: string
          email: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          token?: string
        }
        Relationships: []
      }
      comms_sends: {
        Row: {
          category: string
          dedupe_key: string | null
          error: string | null
          id: string
          is_test: boolean
          lead_id: string | null
          medium: string
          provider_id: string | null
          sent_at: string
          status: string
          subject: string | null
          template: string
          to_email: string | null
          to_phone: string | null
        }
        Insert: {
          category: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          is_test?: boolean
          lead_id?: string | null
          medium: string
          provider_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          template: string
          to_email?: string | null
          to_phone?: string | null
        }
        Update: {
          category?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          is_test?: boolean
          lead_id?: string | null
          medium?: string
          provider_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          template?: string
          to_email?: string | null
          to_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comms_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "campus_waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_suppressions: {
        Row: {
          created_at: string
          email: string | null
          id: string
          phone: string | null
          reason: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          reason: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          reason?: string
          source?: string | null
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
      concept_mappings: {
        Row: {
          concept_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          role: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          role?: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_mappings_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          course_area: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_concept_id: string | null
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          course_area?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_concept_id?: string | null
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          course_area?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_concept_id?: string | null
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "concepts_parent_concept_id_fkey"
            columns: ["parent_concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_parent_id_fkey"
            columns: ["parent_id"]
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
      course_coa: {
        Row: {
          account_id: string
          added_at: string
          course_id: string
          id: string
        }
        Insert: {
          account_id: string
          added_at?: string
          course_id: string
          id?: string
        }
        Update: {
          account_id?: string
          added_at?: string
          course_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_coa_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_coa_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_document: {
        Row: {
          access: string
          campus_id: string | null
          content_hash: string | null
          course_code: string | null
          course_family: string | null
          discovered_by: string | null
          document_type: string
          file_type: string | null
          first_seen: string
          id: string
          is_public_source: boolean
          last_changed: string | null
          last_checked: string | null
          notes: string | null
          processing_status: string
          professor_name: string | null
          source_domain: string | null
          source_url: string
          term: string | null
          textbook_id: string | null
          title: string | null
          value_tier: number
          year: number | null
        }
        Insert: {
          access?: string
          campus_id?: string | null
          content_hash?: string | null
          course_code?: string | null
          course_family?: string | null
          discovered_by?: string | null
          document_type?: string
          file_type?: string | null
          first_seen?: string
          id?: string
          is_public_source?: boolean
          last_changed?: string | null
          last_checked?: string | null
          notes?: string | null
          processing_status?: string
          professor_name?: string | null
          source_domain?: string | null
          source_url: string
          term?: string | null
          textbook_id?: string | null
          title?: string | null
          value_tier?: number
          year?: number | null
        }
        Update: {
          access?: string
          campus_id?: string | null
          content_hash?: string | null
          course_code?: string | null
          course_family?: string | null
          discovered_by?: string | null
          document_type?: string
          file_type?: string | null
          first_seen?: string
          id?: string
          is_public_source?: boolean
          last_changed?: string | null
          last_checked?: string | null
          notes?: string | null
          processing_status?: string
          professor_name?: string | null
          source_domain?: string | null
          source_url?: string
          term?: string | null
          textbook_id?: string | null
          title?: string | null
          value_tier?: number
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_document_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "course_document_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_document_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      course_evidence: {
        Row: {
          campus_id: string | null
          confidence: string
          course_document_id: string | null
          course_family: string | null
          created_at: string
          edition_ref: string | null
          effective_term: string | null
          evidence_type: string
          exam_chapters: Json | null
          exam_label: string | null
          id: string
          professor_name: string | null
          raw_text: string | null
          superseded_by: string | null
          textbook_ref: string | null
        }
        Insert: {
          campus_id?: string | null
          confidence?: string
          course_document_id?: string | null
          course_family?: string | null
          created_at?: string
          edition_ref?: string | null
          effective_term?: string | null
          evidence_type: string
          exam_chapters?: Json | null
          exam_label?: string | null
          id?: string
          professor_name?: string | null
          raw_text?: string | null
          superseded_by?: string | null
          textbook_ref?: string | null
        }
        Update: {
          campus_id?: string | null
          confidence?: string
          course_document_id?: string | null
          course_family?: string | null
          created_at?: string
          edition_ref?: string | null
          effective_term?: string | null
          evidence_type?: string
          exam_chapters?: Json | null
          exam_label?: string | null
          id?: string
          professor_name?: string | null
          raw_text?: string | null
          superseded_by?: string | null
          textbook_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_evidence_course_document_id_fkey"
            columns: ["course_document_id"]
            isOneToOne: false
            referencedRelation: "course_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_evidence_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "course_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      course_intel_campus_status: {
        Row: {
          ai_parses: number
          campus_id: string
          campus_name: string | null
          confirmed_intro1_professors: number
          course_code: string | null
          documents_found: number
          est_cost_usd: number
          exam_1_date: string | null
          exam_1_date_confidence: string | null
          exam_1_date_source_url: string | null
          exam_1_date_term: string | null
          finished_at: string | null
          firecrawl_fetches: number
          high_value_documents: number
          highest_source_confidence: string | null
          last_error: string | null
          pass_a_status: string
          pass_b_status: string
          problem_topics_found: number
          professor_candidates: number
          recommended_next_action: string | null
          restricted_docs_seen: number
          retry_count: number
          review_docs_found: number
          schedules_found: number
          serp_searches: number
          started_at: string | null
          state: string | null
          status: string
          study_guides_found: number
          syllabi_found: number
          textbook_docs_found: number
          updated_at: string
        }
        Insert: {
          ai_parses?: number
          campus_id: string
          campus_name?: string | null
          confirmed_intro1_professors?: number
          course_code?: string | null
          documents_found?: number
          est_cost_usd?: number
          exam_1_date?: string | null
          exam_1_date_confidence?: string | null
          exam_1_date_source_url?: string | null
          exam_1_date_term?: string | null
          finished_at?: string | null
          firecrawl_fetches?: number
          high_value_documents?: number
          highest_source_confidence?: string | null
          last_error?: string | null
          pass_a_status?: string
          pass_b_status?: string
          problem_topics_found?: number
          professor_candidates?: number
          recommended_next_action?: string | null
          restricted_docs_seen?: number
          retry_count?: number
          review_docs_found?: number
          schedules_found?: number
          serp_searches?: number
          started_at?: string | null
          state?: string | null
          status?: string
          study_guides_found?: number
          syllabi_found?: number
          textbook_docs_found?: number
          updated_at?: string
        }
        Update: {
          ai_parses?: number
          campus_id?: string
          campus_name?: string | null
          confirmed_intro1_professors?: number
          course_code?: string | null
          documents_found?: number
          est_cost_usd?: number
          exam_1_date?: string | null
          exam_1_date_confidence?: string | null
          exam_1_date_source_url?: string | null
          exam_1_date_term?: string | null
          finished_at?: string | null
          firecrawl_fetches?: number
          high_value_documents?: number
          highest_source_confidence?: string | null
          last_error?: string | null
          pass_a_status?: string
          pass_b_status?: string
          problem_topics_found?: number
          professor_candidates?: number
          recommended_next_action?: string | null
          restricted_docs_seen?: number
          retry_count?: number
          review_docs_found?: number
          schedules_found?: number
          serp_searches?: number
          started_at?: string | null
          state?: string | null
          status?: string
          study_guides_found?: number
          syllabi_found?: number
          textbook_docs_found?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_intel_campus_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "course_intel_campus_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
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
          course_family: string | null
          course_name: string | null
          created_at: string
          description: string | null
          id: string
          slug: string | null
          status: string
        }
        Insert: {
          code?: string | null
          course_family?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          slug?: string | null
          status?: string
        }
        Update: {
          code?: string | null
          course_family?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          slug?: string | null
          status?: string
        }
        Relationships: []
      }
      default_exam_units: {
        Row: {
          exam_number: number
          is_foundations: boolean
          sort_order: number | null
          unit_id: string
        }
        Insert: {
          exam_number?: number
          is_foundations?: boolean
          sort_order?: number | null
          unit_id: string
        }
        Update: {
          exam_number?: number
          is_foundations?: boolean
          sort_order?: number | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "default_exam_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
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
      edit_events: {
        Row: {
          at: string
          ceq_id: string | null
          created_at: string
          disposition: string
          duration_s: number | null
          final_in_s: number
          final_out_s: number
          how: string
          id: string
          offset_ms: number | null
          onset_ms: number | null
          post_roll_ms: number
          pre_roll_ms: number
          proposed_in_s: number | null
          proposed_out_s: number | null
          rule_version: string
          set_id: string
          slate_end_ms: number | null
          take_name: string | null
          take_path: string
        }
        Insert: {
          at: string
          ceq_id?: string | null
          created_at?: string
          disposition: string
          duration_s?: number | null
          final_in_s: number
          final_out_s: number
          how: string
          id: string
          offset_ms?: number | null
          onset_ms?: number | null
          post_roll_ms: number
          pre_roll_ms: number
          proposed_in_s?: number | null
          proposed_out_s?: number | null
          rule_version: string
          set_id: string
          slate_end_ms?: number | null
          take_name?: string | null
          take_path: string
        }
        Update: {
          at?: string
          ceq_id?: string | null
          created_at?: string
          disposition?: string
          duration_s?: number | null
          final_in_s?: number
          final_out_s?: number
          how?: string
          id?: string
          offset_ms?: number | null
          onset_ms?: number | null
          post_roll_ms?: number
          pre_roll_ms?: number
          proposed_in_s?: number | null
          proposed_out_s?: number | null
          rule_version?: string
          set_id?: string
          slate_end_ms?: number | null
          take_name?: string | null
          take_path?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          expires_at: string | null
          granted_at: string
          greek_chapter_id: string | null
          id: string
          order_id: string | null
          scope: string
          scope_id: string
          source: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          greek_chapter_id?: string | null
          id?: string
          order_id?: string | null
          scope: string
          scope_id: string
          source?: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          greek_chapter_id?: string | null
          id?: string
          order_id?: string | null
          scope?: string
          scope_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_greek_chapter_id_fkey"
            columns: ["greek_chapter_id"]
            isOneToOne: false
            referencedRelation: "greek_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      exam_unit_chapters: {
        Row: {
          chapter_id: string
          exam_unit_id: string
          position: number | null
        }
        Insert: {
          chapter_id: string
          exam_unit_id: string
          position?: number | null
        }
        Update: {
          chapter_id?: string
          exam_unit_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_unit_chapters_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_unit_chapters_exam_unit_id_fkey"
            columns: ["exam_unit_id"]
            isOneToOne: false
            referencedRelation: "exam_units"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_units: {
        Row: {
          course_id: string
          created_at: string
          id: string
          name: string
          position: number | null
          status: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          name: string
          position?: number | null
          status?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_units_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      expand_events: {
        Row: {
          created_at: string
          event: string
          id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
        }
        Relationships: []
      }
      faculty_moves: {
        Row: {
          created_at: string | null
          from_campus_id: string | null
          from_lead_id: string | null
          id: string
          kind: string
          note: string | null
          person_name: string | null
          rmp_from_num: number | null
          rmp_from_rating: number | null
          rmp_to_num: number | null
          rmp_to_rating: number | null
          to_campus_id: string | null
          to_lead_id: string | null
        }
        Insert: {
          created_at?: string | null
          from_campus_id?: string | null
          from_lead_id?: string | null
          id?: string
          kind: string
          note?: string | null
          person_name?: string | null
          rmp_from_num?: number | null
          rmp_from_rating?: number | null
          rmp_to_num?: number | null
          rmp_to_rating?: number | null
          to_campus_id?: string | null
          to_lead_id?: string | null
        }
        Update: {
          created_at?: string | null
          from_campus_id?: string | null
          from_lead_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          person_name?: string | null
          rmp_from_num?: number | null
          rmp_from_rating?: number | null
          rmp_to_num?: number | null
          rmp_to_rating?: number | null
          to_campus_id?: string | null
          to_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faculty_moves_from_campus_id_fkey"
            columns: ["from_campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "faculty_moves_from_campus_id_fkey"
            columns: ["from_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_moves_to_campus_id_fkey"
            columns: ["to_campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "faculty_moves_to_campus_id_fkey"
            columns: ["to_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
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
      frame_segments: {
        Row: {
          beat_index: number
          created_at: string
          end_s: number
          frame_id: string
          id: string
          keeper: boolean
          start_s: number
          take_id: string
        }
        Insert: {
          beat_index: number
          created_at?: string
          end_s: number
          frame_id: string
          id?: string
          keeper?: boolean
          start_s: number
          take_id: string
        }
        Update: {
          beat_index?: number
          created_at?: string
          end_s?: number
          frame_id?: string
          id?: string
          keeper?: boolean
          start_s?: number
          take_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frame_segments_take_id_fkey"
            columns: ["take_id"]
            isOneToOne: false
            referencedRelation: "frame_takes"
            referencedColumns: ["id"]
          },
        ]
      }
      frame_takes: {
        Row: {
          created_at: string
          frame_id: string
          frame_ids: string[] | null
          height: number | null
          id: string
          keeper: boolean
          mux_asset_id: string
          mux_playback_id: string | null
          mux_upload_id: string | null
          onset_s: number | null
          passthrough: string | null
          raw_duration_s: number | null
          status: string
          take_n: number
          trim_warning: string | null
          trimmed_duration_s: number | null
          width: number | null
        }
        Insert: {
          created_at?: string
          frame_id: string
          frame_ids?: string[] | null
          height?: number | null
          id?: string
          keeper?: boolean
          mux_asset_id?: string
          mux_playback_id?: string | null
          mux_upload_id?: string | null
          onset_s?: number | null
          passthrough?: string | null
          raw_duration_s?: number | null
          status?: string
          take_n: number
          trim_warning?: string | null
          trimmed_duration_s?: number | null
          width?: number | null
        }
        Update: {
          created_at?: string
          frame_id?: string
          frame_ids?: string[] | null
          height?: number | null
          id?: string
          keeper?: boolean
          mux_asset_id?: string
          mux_playback_id?: string | null
          mux_upload_id?: string | null
          onset_s?: number | null
          passthrough?: string | null
          raw_duration_s?: number | null
          status?: string
          take_n?: number
          trim_warning?: string | null
          trimmed_duration_s?: number | null
          width?: number | null
        }
        Relationships: []
      }
      greek_990_entity_candidate: {
        Row: {
          candidate_city: string | null
          candidate_ein: string
          candidate_entity_type: string | null
          candidate_legal_name: string | null
          candidate_state: string | null
          chapter_id: string
          created_at: string
          designation_evidence: string | null
          group_exemption_evidence: string | null
          id: string
          location_evidence: string | null
          match_confidence: string | null
          match_score: number | null
          name_evidence: string | null
          recommended_action: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          candidate_city?: string | null
          candidate_ein: string
          candidate_entity_type?: string | null
          candidate_legal_name?: string | null
          candidate_state?: string | null
          chapter_id: string
          created_at?: string
          designation_evidence?: string | null
          group_exemption_evidence?: string | null
          id?: string
          location_evidence?: string | null
          match_confidence?: string | null
          match_score?: number | null
          name_evidence?: string | null
          recommended_action?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_city?: string | null
          candidate_ein?: string
          candidate_entity_type?: string | null
          candidate_legal_name?: string | null
          candidate_state?: string | null
          chapter_id?: string
          created_at?: string
          designation_evidence?: string | null
          group_exemption_evidence?: string | null
          id?: string
          location_evidence?: string | null
          match_confidence?: string | null
          match_score?: number | null
          name_evidence?: string | null
          recommended_action?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "greek_990_entity_candidate_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_990_filing: {
        Row: {
          contributions: number | null
          created_at: string
          ein: string
          form_type: string | null
          gross_receipts: number | null
          id: string
          investment_income: number | null
          legal_entity_id: string
          net_assets: number | null
          object_id: string | null
          pdf_url: string | null
          program_service_revenue: number | null
          retrieved_at: string
          rich_filing_available: boolean
          source: string
          source_reference: string | null
          tax_year: number
          total_assets: number | null
          total_expenses: number | null
          total_liabilities: number | null
          total_revenue: number | null
        }
        Insert: {
          contributions?: number | null
          created_at?: string
          ein: string
          form_type?: string | null
          gross_receipts?: number | null
          id?: string
          investment_income?: number | null
          legal_entity_id: string
          net_assets?: number | null
          object_id?: string | null
          pdf_url?: string | null
          program_service_revenue?: number | null
          retrieved_at?: string
          rich_filing_available?: boolean
          source: string
          source_reference?: string | null
          tax_year: number
          total_assets?: number | null
          total_expenses?: number | null
          total_liabilities?: number | null
          total_revenue?: number | null
        }
        Update: {
          contributions?: number | null
          created_at?: string
          ein?: string
          form_type?: string | null
          gross_receipts?: number | null
          id?: string
          investment_income?: number | null
          legal_entity_id?: string
          net_assets?: number | null
          object_id?: string | null
          pdf_url?: string | null
          program_service_revenue?: number | null
          retrieved_at?: string
          rich_filing_available?: boolean
          source?: string
          source_reference?: string | null
          tax_year?: number
          total_assets?: number | null
          total_expenses?: number | null
          total_liabilities?: number | null
          total_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_990_filing_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "greek_legal_entity"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_990_officer: {
        Row: {
          compensation: number | null
          created_at: string
          ein: string
          first_seen_year: number | null
          hours_per_week: number | null
          id: string
          is_director: boolean
          is_key_employee: boolean
          is_officer: boolean
          is_principal_officer: boolean
          last_seen_year: number | null
          latest_filing_year: number | null
          legal_entity_id: string
          normalized_title: string | null
          person_name: string
          person_name_normalized: string
          source: string
          source_reference: string | null
          stakeholder_class: string | null
          title_as_reported: string | null
          updated_at: string
          years: number[]
        }
        Insert: {
          compensation?: number | null
          created_at?: string
          ein: string
          first_seen_year?: number | null
          hours_per_week?: number | null
          id?: string
          is_director?: boolean
          is_key_employee?: boolean
          is_officer?: boolean
          is_principal_officer?: boolean
          last_seen_year?: number | null
          latest_filing_year?: number | null
          legal_entity_id: string
          normalized_title?: string | null
          person_name: string
          person_name_normalized: string
          source: string
          source_reference?: string | null
          stakeholder_class?: string | null
          title_as_reported?: string | null
          updated_at?: string
          years?: number[]
        }
        Update: {
          compensation?: number | null
          created_at?: string
          ein?: string
          first_seen_year?: number | null
          hours_per_week?: number | null
          id?: string
          is_director?: boolean
          is_key_employee?: boolean
          is_officer?: boolean
          is_principal_officer?: boolean
          last_seen_year?: number | null
          latest_filing_year?: number | null
          legal_entity_id?: string
          normalized_title?: string | null
          person_name?: string
          person_name_normalized?: string
          source?: string
          source_reference?: string | null
          stakeholder_class?: string | null
          title_as_reported?: string | null
          updated_at?: string
          years?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "greek_990_officer_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "greek_legal_entity"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_academic_campus_status: {
        Row: {
          ai_parses: number
          archive_url: string | null
          business_records: number
          campus_id: string
          campus_name: string | null
          chapters_matched: number
          chapters_unmatched: number
          est_cost_usd: number
          finished_at: string | null
          firecrawl_fetches: number
          highest_source_confidence: string | null
          last_attempted_at: string | null
          last_error: string | null
          last_success_at: string | null
          latest_report_term: string | null
          latest_report_year: number | null
          member_records: number
          recommended_next_action: string | null
          reports_found: number
          semesters_found: number
          serp_searches: number
          started_at: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_parses?: number
          archive_url?: string | null
          business_records?: number
          campus_id: string
          campus_name?: string | null
          chapters_matched?: number
          chapters_unmatched?: number
          est_cost_usd?: number
          finished_at?: string | null
          firecrawl_fetches?: number
          highest_source_confidence?: string | null
          last_attempted_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          latest_report_term?: string | null
          latest_report_year?: number | null
          member_records?: number
          recommended_next_action?: string | null
          reports_found?: number
          semesters_found?: number
          serp_searches?: number
          started_at?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_parses?: number
          archive_url?: string | null
          business_records?: number
          campus_id?: string
          campus_name?: string | null
          chapters_matched?: number
          chapters_unmatched?: number
          est_cost_usd?: number
          finished_at?: string | null
          firecrawl_fetches?: number
          highest_source_confidence?: string | null
          last_attempted_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          latest_report_term?: string | null
          latest_report_year?: number | null
          member_records?: number
          recommended_next_action?: string | null
          reports_found?: number
          semesters_found?: number
          serp_searches?: number
          started_at?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "greek_academic_campus_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "greek_academic_campus_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_academic_reports: {
        Row: {
          accounting_students_count: number | null
          business_students_count: number | null
          business_students_percent: number | null
          campus_id: string
          canonical_url: string | null
          confidence: string | null
          content_hash: string | null
          council_scope: string | null
          created_at: string
          discovered_by: string | null
          file_type: string | null
          first_seen: string | null
          id: string
          is_current: boolean
          last_changed: string | null
          last_checked: string | null
          major_breakdown: Json | null
          notes: string | null
          parse_status: string | null
          report_title: string | null
          report_type: string | null
          retrieved_at: string | null
          semester_key: string | null
          source_domain: string | null
          source_type: string | null
          source_url: string
          superseded_by: string | null
          term: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          accounting_students_count?: number | null
          business_students_count?: number | null
          business_students_percent?: number | null
          campus_id: string
          canonical_url?: string | null
          confidence?: string | null
          content_hash?: string | null
          council_scope?: string | null
          created_at?: string
          discovered_by?: string | null
          file_type?: string | null
          first_seen?: string | null
          id?: string
          is_current?: boolean
          last_changed?: string | null
          last_checked?: string | null
          major_breakdown?: Json | null
          notes?: string | null
          parse_status?: string | null
          report_title?: string | null
          report_type?: string | null
          retrieved_at?: string | null
          semester_key?: string | null
          source_domain?: string | null
          source_type?: string | null
          source_url: string
          superseded_by?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          accounting_students_count?: number | null
          business_students_count?: number | null
          business_students_percent?: number | null
          campus_id?: string
          canonical_url?: string | null
          confidence?: string | null
          content_hash?: string | null
          council_scope?: string | null
          created_at?: string
          discovered_by?: string | null
          file_type?: string | null
          first_seen?: string | null
          id?: string
          is_current?: boolean
          last_changed?: string | null
          last_checked?: string | null
          major_breakdown?: Json | null
          notes?: string | null
          parse_status?: string | null
          report_title?: string | null
          report_type?: string | null
          retrieved_at?: string | null
          semester_key?: string | null
          source_domain?: string | null
          source_type?: string | null
          source_url?: string
          superseded_by?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_academic_reports_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "greek_academic_reports_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_academic_reports_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "greek_academic_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_academic_runs: {
        Row: {
          ai_calls: number
          budget_usd: number | null
          campuses_done: number
          campuses_total: number | null
          chapters_written: number
          dry_run: boolean
          error: string | null
          est_cost_usd: number
          finished_at: string | null
          firecrawl_calls: number
          id: string
          notes: string | null
          reports_found: number
          run_kind: string | null
          serp_calls: number
          started_at: string
          status: string
        }
        Insert: {
          ai_calls?: number
          budget_usd?: number | null
          campuses_done?: number
          campuses_total?: number | null
          chapters_written?: number
          dry_run?: boolean
          error?: string | null
          est_cost_usd?: number
          finished_at?: string | null
          firecrawl_calls?: number
          id?: string
          notes?: string | null
          reports_found?: number
          run_kind?: string | null
          serp_calls?: number
          started_at?: string
          status?: string
        }
        Update: {
          ai_calls?: number
          budget_usd?: number | null
          campuses_done?: number
          campuses_total?: number | null
          chapters_written?: number
          dry_run?: boolean
          error?: string | null
          est_cost_usd?: number
          finished_at?: string | null
          firecrawl_calls?: number
          id?: string
          notes?: string | null
          reports_found?: number
          run_kind?: string | null
          serp_calls?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      greek_chapter_990_status: {
        Row: {
          campus_id: string | null
          candidates_found: number
          chapter_id: string
          entities_linked: number
          error: string | null
          filings_found: number
          last_run_at: string | null
          last_success_at: string | null
          officers_found: number
          run_meta: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          candidates_found?: number
          chapter_id: string
          entities_linked?: number
          error?: string | null
          filings_found?: number
          last_run_at?: string | null
          last_success_at?: string | null
          officers_found?: number
          run_meta?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          candidates_found?: number
          chapter_id?: string
          entities_linked?: number
          error?: string | null
          filings_found?: number
          last_run_at?: string | null
          last_success_at?: string | null
          officers_found?: number
          run_meta?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_990_status_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: true
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapter_academic_metrics: {
        Row: {
          academic_context_labels: string[]
          academic_need_score: number | null
          all_greek_difference: number | null
          average_member_count_recent: number | null
          calculated_at: string | null
          campus_greek_chapter_id: string
          campus_id: string | null
          change_1_term: number | null
          change_3_term: number | null
          council_average_gpa: number | null
          council_normalized: string | null
          council_percentile: number | null
          council_rank: number | null
          council_size: number | null
          data_confidence: string | null
          difference_from_council: number | null
          gender_population_difference: number | null
          latest_gpa: number | null
          latest_member_count: number | null
          latest_semester_key: string | null
          latest_term: string | null
          latest_year: number | null
          member_count_trend: number | null
          need_drivers: Json | null
          score_version: string | null
          semesters_available: number
          source_url: string | null
          trend_5_term: number | null
          trend_label: string | null
          updated_at: string
        }
        Insert: {
          academic_context_labels?: string[]
          academic_need_score?: number | null
          all_greek_difference?: number | null
          average_member_count_recent?: number | null
          calculated_at?: string | null
          campus_greek_chapter_id: string
          campus_id?: string | null
          change_1_term?: number | null
          change_3_term?: number | null
          council_average_gpa?: number | null
          council_normalized?: string | null
          council_percentile?: number | null
          council_rank?: number | null
          council_size?: number | null
          data_confidence?: string | null
          difference_from_council?: number | null
          gender_population_difference?: number | null
          latest_gpa?: number | null
          latest_member_count?: number | null
          latest_semester_key?: string | null
          latest_term?: string | null
          latest_year?: number | null
          member_count_trend?: number | null
          need_drivers?: Json | null
          score_version?: string | null
          semesters_available?: number
          source_url?: string | null
          trend_5_term?: number | null
          trend_label?: string | null
          updated_at?: string
        }
        Update: {
          academic_context_labels?: string[]
          academic_need_score?: number | null
          all_greek_difference?: number | null
          average_member_count_recent?: number | null
          calculated_at?: string | null
          campus_greek_chapter_id?: string
          campus_id?: string | null
          change_1_term?: number | null
          change_3_term?: number | null
          council_average_gpa?: number | null
          council_normalized?: string | null
          council_percentile?: number | null
          council_rank?: number | null
          council_size?: number | null
          data_confidence?: string | null
          difference_from_council?: number | null
          gender_population_difference?: number | null
          latest_gpa?: number | null
          latest_member_count?: number | null
          latest_semester_key?: string | null
          latest_term?: string | null
          latest_year?: number | null
          member_count_trend?: number | null
          need_drivers?: Json | null
          score_version?: string | null
          semesters_available?: number
          source_url?: string | null
          trend_5_term?: number | null
          trend_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_academic_metrics_campus_greek_chapter_id_fkey"
            columns: ["campus_greek_chapter_id"]
            isOneToOne: true
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapter_academics: {
        Row: {
          academic_probation_count: number | null
          active_member_count: number | null
          active_member_gpa: number | null
          all_greek_average_gpa: number | null
          all_men_gpa: number | null
          all_undergraduate_gpa: number | null
          all_women_gpa: number | null
          business_students_count: number | null
          business_students_percent: number | null
          campus_greek_chapter_id: string | null
          campus_id: string
          canonical_chapter_name: string | null
          chapter_gpa: number | null
          chapter_name_as_reported: string
          chapter_rank_within_council: number | null
          council: string | null
          council_average_gpa: number | null
          council_normalized: string | null
          created_at: string
          deans_list_count: number | null
          deans_list_percent: number | null
          gpa_scale: number | null
          greek_org_id: string | null
          id: string
          match_confidence: string | null
          match_status: string | null
          member_count: number | null
          new_member_count: number | null
          new_member_gpa: number | null
          number_of_chapters_in_council: number | null
          parse_confidence: string | null
          quality_flags: string[]
          semester_key: string | null
          source_report_id: string
          source_url: string | null
          term: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          academic_probation_count?: number | null
          active_member_count?: number | null
          active_member_gpa?: number | null
          all_greek_average_gpa?: number | null
          all_men_gpa?: number | null
          all_undergraduate_gpa?: number | null
          all_women_gpa?: number | null
          business_students_count?: number | null
          business_students_percent?: number | null
          campus_greek_chapter_id?: string | null
          campus_id: string
          canonical_chapter_name?: string | null
          chapter_gpa?: number | null
          chapter_name_as_reported: string
          chapter_rank_within_council?: number | null
          council?: string | null
          council_average_gpa?: number | null
          council_normalized?: string | null
          created_at?: string
          deans_list_count?: number | null
          deans_list_percent?: number | null
          gpa_scale?: number | null
          greek_org_id?: string | null
          id?: string
          match_confidence?: string | null
          match_status?: string | null
          member_count?: number | null
          new_member_count?: number | null
          new_member_gpa?: number | null
          number_of_chapters_in_council?: number | null
          parse_confidence?: string | null
          quality_flags?: string[]
          semester_key?: string | null
          source_report_id: string
          source_url?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          academic_probation_count?: number | null
          active_member_count?: number | null
          active_member_gpa?: number | null
          all_greek_average_gpa?: number | null
          all_men_gpa?: number | null
          all_undergraduate_gpa?: number | null
          all_women_gpa?: number | null
          business_students_count?: number | null
          business_students_percent?: number | null
          campus_greek_chapter_id?: string | null
          campus_id?: string
          canonical_chapter_name?: string | null
          chapter_gpa?: number | null
          chapter_name_as_reported?: string
          chapter_rank_within_council?: number | null
          council?: string | null
          council_average_gpa?: number | null
          council_normalized?: string | null
          created_at?: string
          deans_list_count?: number | null
          deans_list_percent?: number | null
          gpa_scale?: number | null
          greek_org_id?: string | null
          id?: string
          match_confidence?: string | null
          match_status?: string | null
          member_count?: number | null
          new_member_count?: number | null
          new_member_gpa?: number | null
          number_of_chapters_in_council?: number | null
          parse_confidence?: string | null
          quality_flags?: string[]
          semester_key?: string | null
          source_report_id?: string
          source_url?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_academics_campus_greek_chapter_id_fkey"
            columns: ["campus_greek_chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_chapter_academics_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "greek_chapter_academics_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_chapter_academics_greek_org_id_fkey"
            columns: ["greek_org_id"]
            isOneToOne: false
            referencedRelation: "greek_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_chapter_academics_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "greek_academic_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapter_claims: {
        Row: {
          campus_greek_chapter_id: string
          created_at: string
          decided_at: string | null
          email: string
          id: string
          members_at_claim: number
          name: string
          phone: string
          position: string
          status: string
        }
        Insert: {
          campus_greek_chapter_id: string
          created_at?: string
          decided_at?: string | null
          email: string
          id?: string
          members_at_claim?: number
          name: string
          phone: string
          position: string
          status?: string
        }
        Update: {
          campus_greek_chapter_id?: string
          created_at?: string
          decided_at?: string | null
          email?: string
          id?: string
          members_at_claim?: number
          name?: string
          phone?: string
          position?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_claims_campus_greek_chapter_id_fkey"
            columns: ["campus_greek_chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapter_contacts: {
        Row: {
          chapter_id: string
          confidence: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          needs_verification: boolean | null
          notes: string | null
          phone: string | null
          role: string
          source: string | null
          updated_at: string | null
        }
        Insert: {
          chapter_id: string
          confidence?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          needs_verification?: boolean | null
          notes?: string | null
          phone?: string | null
          role: string
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string
          confidence?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          needs_verification?: boolean | null
          notes?: string | null
          phone?: string | null
          role?: string
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_contacts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapter_legal_entity: {
        Row: {
          chapter_id: string
          first_seen_at: string
          id: string
          last_verified_at: string | null
          legal_entity_id: string
          match_confidence: string
          match_evidence: Json
          match_method: string | null
          match_score: number | null
          relationship_type: string
          source_reference: string | null
          source_url: string | null
          verified_at: string | null
          verified_by: string | null
          verified_status: string
        }
        Insert: {
          chapter_id: string
          first_seen_at?: string
          id?: string
          last_verified_at?: string | null
          legal_entity_id: string
          match_confidence: string
          match_evidence?: Json
          match_method?: string | null
          match_score?: number | null
          relationship_type?: string
          source_reference?: string | null
          source_url?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_status?: string
        }
        Update: {
          chapter_id?: string
          first_seen_at?: string
          id?: string
          last_verified_at?: string | null
          legal_entity_id?: string
          match_confidence?: string
          match_evidence?: Json
          match_method?: string | null
          match_score?: number | null
          relationship_type?: string
          source_reference?: string | null
          source_url?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_legal_entity_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_chapter_legal_entity_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "greek_legal_entity"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapter_members: {
        Row: {
          chapter_id: string
          id: string
          joined_at: string
          name: string | null
          phone: string | null
          seat_assigned_at: string | null
          sets_completed: number
          source: string
          tagged_at: string
          user_id: string | null
        }
        Insert: {
          chapter_id: string
          id?: string
          joined_at?: string
          name?: string | null
          phone?: string | null
          seat_assigned_at?: string | null
          sets_completed?: number
          source?: string
          tagged_at?: string
          user_id?: string | null
        }
        Update: {
          chapter_id?: string
          id?: string
          joined_at?: string
          name?: string | null
          phone?: string | null
          seat_assigned_at?: string | null
          sets_completed?: number
          source?: string
          tagged_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_members_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapter_transfers: {
        Row: {
          created_at: string
          decided_by: string
          from_email: string | null
          from_name_role: string | null
          greek_chapter_id: string
          id: string
          reason: string | null
          to_email: string
          to_name_role: string
          to_phone: string | null
        }
        Insert: {
          created_at?: string
          decided_by: string
          from_email?: string | null
          from_name_role?: string | null
          greek_chapter_id: string
          id?: string
          reason?: string | null
          to_email: string
          to_name_role: string
          to_phone?: string | null
        }
        Update: {
          created_at?: string
          decided_by?: string
          from_email?: string | null
          from_name_role?: string | null
          greek_chapter_id?: string
          id?: string
          reason?: string | null
          to_email?: string
          to_name_role?: string
          to_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapter_transfers_greek_chapter_id_fkey"
            columns: ["greek_chapter_id"]
            isOneToOne: false
            referencedRelation: "greek_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_chapters: {
        Row: {
          admin_email: string | null
          admin_name_role: string | null
          admin_phone: string | null
          campus_greek_chapter_id: string | null
          campus_id: string | null
          chapter_name: string
          claim_status: string
          created_at: string
          digest_enabled: boolean
          greek_org_id: string | null
          id: string
          link_expires_at: string
          needs_review: boolean
          phone_verified_at: string | null
          school_name: string
          seats_note: string | null
          seats_total: number
          seats_updated_at: string | null
          slug: string
          status: string
          verify_code: string | null
          verify_expires_at: string | null
        }
        Insert: {
          admin_email?: string | null
          admin_name_role?: string | null
          admin_phone?: string | null
          campus_greek_chapter_id?: string | null
          campus_id?: string | null
          chapter_name: string
          claim_status?: string
          created_at?: string
          digest_enabled?: boolean
          greek_org_id?: string | null
          id?: string
          link_expires_at?: string
          needs_review?: boolean
          phone_verified_at?: string | null
          school_name: string
          seats_note?: string | null
          seats_total?: number
          seats_updated_at?: string | null
          slug: string
          status?: string
          verify_code?: string | null
          verify_expires_at?: string | null
        }
        Update: {
          admin_email?: string | null
          admin_name_role?: string | null
          admin_phone?: string | null
          campus_greek_chapter_id?: string | null
          campus_id?: string | null
          chapter_name?: string
          claim_status?: string
          created_at?: string
          digest_enabled?: boolean
          greek_org_id?: string | null
          id?: string
          link_expires_at?: string
          needs_review?: boolean
          phone_verified_at?: string | null
          school_name?: string
          seats_note?: string | null
          seats_total?: number
          seats_updated_at?: string | null
          slug?: string
          status?: string
          verify_code?: string | null
          verify_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_chapters_campus_greek_chapter_id_fkey"
            columns: ["campus_greek_chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_chapters_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "greek_chapters_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_firm_leads: {
        Row: {
          category: string | null
          created_at: string
          firm_name: string
          id: string
          industry: string | null
          notes: string | null
          phone: string | null
          source: string
          status: string
          updated_at: string
          vendor_list_org: string | null
          vendor_list_url: string | null
          website_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          firm_name: string
          id?: string
          industry?: string | null
          notes?: string | null
          phone?: string | null
          source?: string
          status?: string
          updated_at?: string
          vendor_list_org?: string | null
          vendor_list_url?: string | null
          website_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          firm_name?: string
          id?: string
          industry?: string | null
          notes?: string | null
          phone?: string | null
          source?: string
          status?: string
          updated_at?: string
          vendor_list_org?: string | null
          vendor_list_url?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      greek_legal_entity: {
        Row: {
          affiliation_code: string | null
          alternate_names: Json
          asset_amt: number | null
          bmf_raw: Json | null
          city: string | null
          classification: string | null
          created_at: string
          deductibility_code: string | null
          ein: string
          entity_type: string
          entity_type_confidence: string | null
          entity_type_evidence: string | null
          filing_requirement: string | null
          first_seen_at: string
          group_exemption_number: string | null
          id: string
          income_amt: number | null
          irs_subsection: string | null
          last_checked_at: string | null
          legal_name: string
          national_greek_org_id: string | null
          ntee_code: string | null
          parent_ein: string | null
          revenue_amt: number | null
          ruling_date: string | null
          sort_name: string | null
          source: string
          source_reference: string | null
          state: string | null
          tax_exempt_status: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          affiliation_code?: string | null
          alternate_names?: Json
          asset_amt?: number | null
          bmf_raw?: Json | null
          city?: string | null
          classification?: string | null
          created_at?: string
          deductibility_code?: string | null
          ein: string
          entity_type?: string
          entity_type_confidence?: string | null
          entity_type_evidence?: string | null
          filing_requirement?: string | null
          first_seen_at?: string
          group_exemption_number?: string | null
          id?: string
          income_amt?: number | null
          irs_subsection?: string | null
          last_checked_at?: string | null
          legal_name: string
          national_greek_org_id?: string | null
          ntee_code?: string | null
          parent_ein?: string | null
          revenue_amt?: number | null
          ruling_date?: string | null
          sort_name?: string | null
          source: string
          source_reference?: string | null
          state?: string | null
          tax_exempt_status?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          affiliation_code?: string | null
          alternate_names?: Json
          asset_amt?: number | null
          bmf_raw?: Json | null
          city?: string | null
          classification?: string | null
          created_at?: string
          deductibility_code?: string | null
          ein?: string
          entity_type?: string
          entity_type_confidence?: string | null
          entity_type_evidence?: string | null
          filing_requirement?: string | null
          first_seen_at?: string
          group_exemption_number?: string | null
          id?: string
          income_amt?: number | null
          irs_subsection?: string | null
          last_checked_at?: string | null
          legal_name?: string
          national_greek_org_id?: string | null
          ntee_code?: string | null
          parent_ein?: string | null
          revenue_amt?: number | null
          ruling_date?: string | null
          sort_name?: string | null
          source?: string
          source_reference?: string | null
          state?: string | null
          tax_exempt_status?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_legal_entity_national_greek_org_id_fkey"
            columns: ["national_greek_org_id"]
            isOneToOne: false
            referencedRelation: "greek_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_org_filings: {
        Row: {
          accum_depreciation: number | null
          assets_eoy: number | null
          buildings_gross: number | null
          chapter_id: string | null
          contributions: number | null
          created_at: string
          employees_count: number | null
          equipment_gross: number | null
          expenses: number | null
          food_expense: number | null
          fundraiser_fee: number | null
          fundraiser_firm: string | null
          grants_paid: number | null
          id: string
          insurance_expense: number | null
          interest_expense: number | null
          land_buildings_gross: number | null
          liabilities_eoy: number | null
          mortgages_payable: number | null
          object_id: string | null
          org_id: string | null
          pdf_url: string | null
          preparer_address: string | null
          preparer_firm: string | null
          preparer_phone: string | null
          program_revenue_detail: Json | null
          repairs_expense: number | null
          revenue: number | null
          salaries: number | null
          source: string
          tax_year: number | null
        }
        Insert: {
          accum_depreciation?: number | null
          assets_eoy?: number | null
          buildings_gross?: number | null
          chapter_id?: string | null
          contributions?: number | null
          created_at?: string
          employees_count?: number | null
          equipment_gross?: number | null
          expenses?: number | null
          food_expense?: number | null
          fundraiser_fee?: number | null
          fundraiser_firm?: string | null
          grants_paid?: number | null
          id?: string
          insurance_expense?: number | null
          interest_expense?: number | null
          land_buildings_gross?: number | null
          liabilities_eoy?: number | null
          mortgages_payable?: number | null
          object_id?: string | null
          org_id?: string | null
          pdf_url?: string | null
          preparer_address?: string | null
          preparer_firm?: string | null
          preparer_phone?: string | null
          program_revenue_detail?: Json | null
          repairs_expense?: number | null
          revenue?: number | null
          salaries?: number | null
          source?: string
          tax_year?: number | null
        }
        Update: {
          accum_depreciation?: number | null
          assets_eoy?: number | null
          buildings_gross?: number | null
          chapter_id?: string | null
          contributions?: number | null
          created_at?: string
          employees_count?: number | null
          equipment_gross?: number | null
          expenses?: number | null
          food_expense?: number | null
          fundraiser_fee?: number | null
          fundraiser_firm?: string | null
          grants_paid?: number | null
          id?: string
          insurance_expense?: number | null
          interest_expense?: number | null
          land_buildings_gross?: number | null
          liabilities_eoy?: number | null
          mortgages_payable?: number | null
          object_id?: string | null
          org_id?: string | null
          pdf_url?: string | null
          preparer_address?: string | null
          preparer_firm?: string | null
          preparer_phone?: string | null
          program_revenue_detail?: Json | null
          repairs_expense?: number | null
          revenue?: number | null
          salaries?: number | null
          source?: string
          tax_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_org_filings_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_org_filings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "greek_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_org_people: {
        Row: {
          alma_mater: string | null
          business_url: string | null
          chapter_id: string | null
          created_at: string
          email: string | null
          employer: string | null
          enrichment_status: string
          first_year: number | null
          id: string
          is_current: boolean
          last_year: number | null
          linkedin_url: string | null
          notes: string | null
          org_id: string | null
          person_name: string
          phone: string | null
          role_now: string | null
          source: string
          titles: string[]
          updated_at: string
          years: number[]
          years_count: number
        }
        Insert: {
          alma_mater?: string | null
          business_url?: string | null
          chapter_id?: string | null
          created_at?: string
          email?: string | null
          employer?: string | null
          enrichment_status?: string
          first_year?: number | null
          id?: string
          is_current?: boolean
          last_year?: number | null
          linkedin_url?: string | null
          notes?: string | null
          org_id?: string | null
          person_name: string
          phone?: string | null
          role_now?: string | null
          source?: string
          titles?: string[]
          updated_at?: string
          years?: number[]
          years_count?: number
        }
        Update: {
          alma_mater?: string | null
          business_url?: string | null
          chapter_id?: string | null
          created_at?: string
          email?: string | null
          employer?: string | null
          enrichment_status?: string
          first_year?: number | null
          id?: string
          is_current?: boolean
          last_year?: number | null
          linkedin_url?: string | null
          notes?: string | null
          org_id?: string | null
          person_name?: string
          phone?: string | null
          role_now?: string | null
          source?: string
          titles?: string[]
          updated_at?: string
          years?: number[]
          years_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "greek_org_people_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "campus_greek_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greek_org_people_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "greek_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      greek_org_propublica_cache: {
        Row: {
          ein: string
          fetched_at: string
          response: Json | null
        }
        Insert: {
          ein: string
          fetched_at?: string
          response?: Json | null
        }
        Update: {
          ein?: string
          fetched_at?: string
          response?: Json | null
        }
        Relationships: []
      }
      greek_orgs: {
        Row: {
          address: string | null
          council: string | null
          created_at: string | null
          domain: string | null
          ein: string | null
          enrichment_note: string | null
          enrichment_status: string
          founded_year: string | null
          housing_entity: string | null
          id: string
          is_active: boolean | null
          letters: string | null
          name: string | null
          national_website: string | null
          nickname: string | null
          notes: string | null
          org_type: string | null
          propublica_url: string | null
          updated_at: string | null
          vendor_notes: string | null
          vendor_status: string
        }
        Insert: {
          address?: string | null
          council?: string | null
          created_at?: string | null
          domain?: string | null
          ein?: string | null
          enrichment_note?: string | null
          enrichment_status?: string
          founded_year?: string | null
          housing_entity?: string | null
          id?: string
          is_active?: boolean | null
          letters?: string | null
          name?: string | null
          national_website?: string | null
          nickname?: string | null
          notes?: string | null
          org_type?: string | null
          propublica_url?: string | null
          updated_at?: string | null
          vendor_notes?: string | null
          vendor_status?: string
        }
        Update: {
          address?: string | null
          council?: string | null
          created_at?: string | null
          domain?: string | null
          ein?: string | null
          enrichment_note?: string | null
          enrichment_status?: string
          founded_year?: string | null
          housing_entity?: string | null
          id?: string
          is_active?: boolean | null
          letters?: string | null
          name?: string | null
          national_website?: string | null
          nickname?: string | null
          notes?: string | null
          org_type?: string | null
          propublica_url?: string | null
          updated_at?: string | null
          vendor_notes?: string | null
          vendor_status?: string
        }
        Relationships: []
      }
      growth_advisor_links: {
        Row: {
          advisor_id: string
          campus_id: string | null
          council_type: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          source_contact_id: string | null
          source_contact_source: string | null
          source_url: string | null
        }
        Insert: {
          advisor_id: string
          campus_id?: string | null
          council_type?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          source_contact_id?: string | null
          source_contact_source?: string | null
          source_url?: string | null
        }
        Update: {
          advisor_id?: string
          campus_id?: string | null
          council_type?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          source_contact_id?: string | null
          source_contact_source?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_advisor_links_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "growth_advisors"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_advisors: {
        Row: {
          chapters_linked: number
          confidence: string
          councils_linked: number
          created_at: string
          email: string | null
          first_seen: string
          id: string
          last_seen: string
          last_verified_at: string | null
          name: string | null
          phone: string | null
          primary_campus_id: string | null
          source_type: string | null
          source_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          chapters_linked?: number
          confidence?: string
          councils_linked?: number
          created_at?: string
          email?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          last_verified_at?: string | null
          name?: string | null
          phone?: string | null
          primary_campus_id?: string | null
          source_type?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          chapters_linked?: number
          confidence?: string
          councils_linked?: number
          created_at?: string
          email?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          last_verified_at?: string | null
          name?: string | null
          phone?: string | null
          primary_campus_id?: string | null
          source_type?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_advisors_primary_campus_id_fkey"
            columns: ["primary_campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_advisors_primary_campus_id_fkey"
            columns: ["primary_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_business_clubs: {
        Row: {
          campus_id: string
          category: string
          confidence: string
          created_at: string
          discovery_run_id: string | null
          effective_term: string | null
          effective_year: number | null
          facebook_url: string | null
          first_seen: string
          general_email: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          last_seen: string
          last_verified_at: string | null
          name: string
          normalized_name: string
          notes: string | null
          retrieved_at: string
          source_type: string
          source_url: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          campus_id: string
          category: string
          confidence?: string
          created_at?: string
          discovery_run_id?: string | null
          effective_term?: string | null
          effective_year?: number | null
          facebook_url?: string | null
          first_seen?: string
          general_email?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          last_seen?: string
          last_verified_at?: string | null
          name: string
          normalized_name: string
          notes?: string | null
          retrieved_at?: string
          source_type?: string
          source_url: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          campus_id?: string
          category?: string
          confidence?: string
          created_at?: string
          discovery_run_id?: string | null
          effective_term?: string | null
          effective_year?: number | null
          facebook_url?: string | null
          first_seen?: string
          general_email?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          last_seen?: string
          last_verified_at?: string | null
          name?: string
          normalized_name?: string
          notes?: string | null
          retrieved_at?: string
          source_type?: string
          source_url?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_business_clubs_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_business_clubs_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_campus_pins: {
        Row: {
          campus_id: string
          manual_priority: number | null
          note: string | null
          pinned: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campus_id: string
          manual_priority?: number | null
          note?: string | null
          pinned?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campus_id?: string
          manual_priority?: number | null
          note?: string | null
          pinned?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_campus_pins_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_campus_pins_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_campus_priority: {
        Row: {
          campus_id: string
          components: Json
          computed_at: string
          rank: number
          score: number
          version: string
          why: string[]
        }
        Insert: {
          campus_id: string
          components?: Json
          computed_at?: string
          rank: number
          score: number
          version: string
          why?: string[]
        }
        Update: {
          campus_id?: string
          components?: Json
          computed_at?: string
          rank?: number
          score?: number
          version?: string
          why?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "growth_campus_priority_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_campus_priority_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_contact_evidence: {
        Row: {
          club_id: string | null
          confidence: string
          contact_id: string | null
          created_at: string
          id: string
          matched_kind: string | null
          matched_value: string | null
          retrieved_at: string
          snippet: string | null
          source_type: string
          source_url: string
        }
        Insert: {
          club_id?: string | null
          confidence?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          matched_kind?: string | null
          matched_value?: string | null
          retrieved_at?: string
          snippet?: string | null
          source_type?: string
          source_url: string
        }
        Update: {
          club_id?: string | null
          confidence?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          matched_kind?: string | null
          matched_value?: string | null
          retrieved_at?: string
          snippet?: string | null
          source_type?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_contact_evidence_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "growth_business_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_contact_evidence_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "growth_public_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_contact_qc: {
        Row: {
          campaign_purpose: string | null
          campus_id: string | null
          confidence: string | null
          contact_source: string
          contact_type: string | null
          council_type: string | null
          created_at: string
          effective_term: string | null
          effective_year: number | null
          email: string | null
          entity_id: string | null
          entity_type: string | null
          freshness_status: string
          id: string
          instagram: string | null
          last_verified_at: string | null
          name: string | null
          outreach_eligible: boolean
          qc_action: string
          qc_at: string | null
          qc_by: string | null
          qc_edits: Json | null
          qc_notes: string | null
          review_reason: string | null
          role: string | null
          source_id: string
          source_type: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          campaign_purpose?: string | null
          campus_id?: string | null
          confidence?: string | null
          contact_source: string
          contact_type?: string | null
          council_type?: string | null
          created_at?: string
          effective_term?: string | null
          effective_year?: number | null
          email?: string | null
          entity_id?: string | null
          entity_type?: string | null
          freshness_status?: string
          id?: string
          instagram?: string | null
          last_verified_at?: string | null
          name?: string | null
          outreach_eligible?: boolean
          qc_action?: string
          qc_at?: string | null
          qc_by?: string | null
          qc_edits?: Json | null
          qc_notes?: string | null
          review_reason?: string | null
          role?: string | null
          source_id: string
          source_type?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          campaign_purpose?: string | null
          campus_id?: string | null
          confidence?: string | null
          contact_source?: string
          contact_type?: string | null
          council_type?: string | null
          created_at?: string
          effective_term?: string | null
          effective_year?: number | null
          email?: string | null
          entity_id?: string | null
          entity_type?: string | null
          freshness_status?: string
          id?: string
          instagram?: string | null
          last_verified_at?: string | null
          name?: string | null
          outreach_eligible?: boolean
          qc_action?: string
          qc_at?: string | null
          qc_by?: string | null
          qc_edits?: Json | null
          qc_notes?: string | null
          review_reason?: string | null
          role?: string | null
          source_id?: string
          source_type?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      growth_contact_roles: {
        Row: {
          campus_id: string | null
          contact_id: string
          council_slug: string | null
          created_at: string
          created_by: string | null
          end_term: string | null
          entity_id: string | null
          entity_type: string
          id: string
          is_current: boolean
          notes: string | null
          role: string | null
          source: string | null
          source_url: string | null
          start_term: string | null
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          contact_id: string
          council_slug?: string | null
          created_at?: string
          created_by?: string | null
          end_term?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          is_current?: boolean
          notes?: string | null
          role?: string | null
          source?: string | null
          source_url?: string | null
          start_term?: string | null
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          contact_id?: string
          council_slug?: string | null
          created_at?: string
          created_by?: string | null
          end_term?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          is_current?: boolean
          notes?: string | null
          role?: string | null
          source?: string | null
          source_url?: string | null
          start_term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_contact_roles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "growth_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          instagram: string | null
          last_verified_at: string | null
          notes: string | null
          phone: string | null
          source: string | null
          source_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          instagram?: string | null
          last_verified_at?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          instagram?: string | null
          last_verified_at?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      growth_discovery_runs: {
        Row: {
          ai_calls: number
          budget_usd: number | null
          campus_ids: string[] | null
          campuses_done: number
          campuses_total: number
          created_by: string | null
          dry_run: boolean
          error: string | null
          est_cost_usd: number
          finished_at: string | null
          firecrawl_calls: number
          id: string
          notes: string | null
          run_kind: string
          serp_calls: number
          started_at: string
          status: string
        }
        Insert: {
          ai_calls?: number
          budget_usd?: number | null
          campus_ids?: string[] | null
          campuses_done?: number
          campuses_total?: number
          created_by?: string | null
          dry_run?: boolean
          error?: string | null
          est_cost_usd?: number
          finished_at?: string | null
          firecrawl_calls?: number
          id?: string
          notes?: string | null
          run_kind: string
          serp_calls?: number
          started_at?: string
          status?: string
        }
        Update: {
          ai_calls?: number
          budget_usd?: number | null
          campus_ids?: string[] | null
          campuses_done?: number
          campuses_total?: number
          created_by?: string | null
          dry_run?: boolean
          error?: string | null
          est_cost_usd?: number
          finished_at?: string | null
          firecrawl_calls?: number
          id?: string
          notes?: string | null
          run_kind?: string
          serp_calls?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      growth_discovery_status: {
        Row: {
          campus_id: string
          category: string
          discovery_run_id: string | null
          entity_id: string | null
          error: string | null
          id: string
          last_attempted_at: string | null
          last_success_at: string | null
          results_found: number
          status: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          category: string
          discovery_run_id?: string | null
          entity_id?: string | null
          error?: string | null
          id?: string
          last_attempted_at?: string | null
          last_success_at?: string | null
          results_found?: number
          status?: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          category?: string
          discovery_run_id?: string | null
          entity_id?: string | null
          error?: string | null
          id?: string
          last_attempted_at?: string | null
          last_success_at?: string | null
          results_found?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_discovery_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_discovery_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_map_approvals: {
        Row: {
          action: string
          approved_by: string
          campus_exam_id: string | null
          campus_id: string
          created_at: string
          id: string
          payload: Json
          professor_id: string | null
        }
        Insert: {
          action: string
          approved_by: string
          campus_exam_id?: string | null
          campus_id: string
          created_at?: string
          id?: string
          payload?: Json
          professor_id?: string | null
        }
        Update: {
          action?: string
          approved_by?: string
          campus_exam_id?: string | null
          campus_id?: string
          created_at?: string
          id?: string
          payload?: Json
          professor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_map_approvals_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_map_approvals_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_outreach_events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string | null
          campaign_id: string | null
          campus_id: string | null
          channel: string
          contact_id: string | null
          council_slug: string | null
          created_at: string
          created_by: string | null
          direction: string
          email: string | null
          entity_id: string | null
          entity_type: string | null
          external_thread_id: string | null
          follow_up_done_at: string | null
          id: number
          message_id: string | null
          next_follow_up_at: string | null
          notes: string | null
          occurred_at: string
          reply_category: string | null
          status: string
          subject: string | null
          template_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          campaign_id?: string | null
          campus_id?: string | null
          channel: string
          contact_id?: string | null
          council_slug?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          email?: string | null
          entity_id?: string | null
          entity_type?: string | null
          external_thread_id?: string | null
          follow_up_done_at?: string | null
          id?: number
          message_id?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          occurred_at?: string
          reply_category?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          campaign_id?: string | null
          campus_id?: string | null
          channel?: string
          contact_id?: string | null
          council_slug?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          email?: string | null
          entity_id?: string | null
          entity_type?: string | null
          external_thread_id?: string | null
          follow_up_done_at?: string | null
          id?: number
          message_id?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          occurred_at?: string
          reply_category?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_outreach_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "growth_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_outreach_templates: {
        Row: {
          audience: string
          body: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience: string
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      growth_public_contacts: {
        Row: {
          campus_id: string
          category: string
          confidence: string
          contact_type: string
          created_at: string
          discovery_run_id: string | null
          effective_term: string | null
          effective_year: number | null
          email: string | null
          entity_id: string
          entity_type: string
          facebook_url: string | null
          first_seen: string
          id: string
          instagram_url: string | null
          is_current: boolean | null
          last_seen: string
          last_verified_at: string | null
          name: string | null
          notes: string | null
          phone: string | null
          retrieved_at: string
          role: string | null
          source_type: string
          source_url: string
          superseded_by: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          campus_id: string
          category: string
          confidence?: string
          contact_type?: string
          created_at?: string
          discovery_run_id?: string | null
          effective_term?: string | null
          effective_year?: number | null
          email?: string | null
          entity_id: string
          entity_type: string
          facebook_url?: string | null
          first_seen?: string
          id?: string
          instagram_url?: string | null
          is_current?: boolean | null
          last_seen?: string
          last_verified_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          retrieved_at?: string
          role?: string | null
          source_type?: string
          source_url: string
          superseded_by?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          campus_id?: string
          category?: string
          confidence?: string
          contact_type?: string
          created_at?: string
          discovery_run_id?: string | null
          effective_term?: string | null
          effective_year?: number | null
          email?: string | null
          entity_id?: string
          entity_type?: string
          facebook_url?: string | null
          first_seen?: string
          id?: string
          instagram_url?: string | null
          is_current?: boolean | null
          last_seen?: string
          last_verified_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          retrieved_at?: string
          role?: string | null
          source_type?: string
          source_url?: string
          superseded_by?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_public_contacts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_public_contacts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_public_contacts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "growth_public_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_scoring_exclusions: {
        Row: {
          campus_id: string
          created_at: string
          id: string
          metric: string
          note: string | null
          reason: string
          status: string
          value: number | null
        }
        Insert: {
          campus_id: string
          created_at?: string
          id?: string
          metric: string
          note?: string | null
          reason: string
          status?: string
          value?: number | null
        }
        Update: {
          campus_id?: string
          created_at?: string
          id?: string
          metric?: string
          note?: string | null
          reason?: string
          status?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_scoring_exclusions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "growth_scoring_exclusions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      hasselback_faculty: {
        Row: {
          area_codes: string | null
          areas_decoded: string | null
          cia: string | null
          city: string | null
          cma: string | null
          cpa: string | null
          created_at: string | null
          degree: string | null
          degree_school: string | null
          degree_year: string | null
          edition: string | null
          email_username: string | null
          first: string | null
          first_initial: string | null
          id: string
          in_2015_2016: string | null
          last: string | null
          matched_campus_id: string | null
          name: string | null
          norm_last: string | null
          rank: string | null
          school_attribution_suspect: string | null
          school_domain: string | null
          school_name: string | null
          start_year: string | null
          start_year_2015: string | null
          state: string | null
          teaches_financial: string | null
          teaches_managerial: string | null
          teaches_principles: string | null
          tenure_10yr_plus: string | null
        }
        Insert: {
          area_codes?: string | null
          areas_decoded?: string | null
          cia?: string | null
          city?: string | null
          cma?: string | null
          cpa?: string | null
          created_at?: string | null
          degree?: string | null
          degree_school?: string | null
          degree_year?: string | null
          edition?: string | null
          email_username?: string | null
          first?: string | null
          first_initial?: string | null
          id?: string
          in_2015_2016?: string | null
          last?: string | null
          matched_campus_id?: string | null
          name?: string | null
          norm_last?: string | null
          rank?: string | null
          school_attribution_suspect?: string | null
          school_domain?: string | null
          school_name?: string | null
          start_year?: string | null
          start_year_2015?: string | null
          state?: string | null
          teaches_financial?: string | null
          teaches_managerial?: string | null
          teaches_principles?: string | null
          tenure_10yr_plus?: string | null
        }
        Update: {
          area_codes?: string | null
          areas_decoded?: string | null
          cia?: string | null
          city?: string | null
          cma?: string | null
          cpa?: string | null
          created_at?: string | null
          degree?: string | null
          degree_school?: string | null
          degree_year?: string | null
          edition?: string | null
          email_username?: string | null
          first?: string | null
          first_initial?: string | null
          id?: string
          in_2015_2016?: string | null
          last?: string | null
          matched_campus_id?: string | null
          name?: string | null
          norm_last?: string | null
          rank?: string | null
          school_attribution_suspect?: string | null
          school_domain?: string | null
          school_name?: string | null
          start_year?: string | null
          start_year_2015?: string | null
          state?: string | null
          teaches_financial?: string | null
          teaches_managerial?: string | null
          teaches_principles?: string | null
          tenure_10yr_plus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hasselback_faculty_matched_campus_id_fkey"
            columns: ["matched_campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "hasselback_faculty_matched_campus_id_fkey"
            columns: ["matched_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_notes: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          id: string
          text: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: string
          created_at?: string
          id: string
          text: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          id?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbound_files: {
        Row: {
          campus_id: string | null
          campus_name: string | null
          files: Json
          id: string
          notes: string | null
          professor_name: string | null
          reviewed: boolean
          reviewer: string | null
          source: string
          student_email: string | null
          submitted_at: string
        }
        Insert: {
          campus_id?: string | null
          campus_name?: string | null
          files?: Json
          id?: string
          notes?: string | null
          professor_name?: string | null
          reviewed?: boolean
          reviewer?: string | null
          source?: string
          student_email?: string | null
          submitted_at?: string
        }
        Update: {
          campus_id?: string | null
          campus_name?: string | null
          files?: Json
          id?: string
          notes?: string | null
          professor_name?: string | null
          reviewed?: boolean
          reviewer?: string | null
          source?: string
          student_email?: string | null
          submitted_at?: string
        }
        Relationships: []
      }
      je_principles: {
        Row: {
          key: string
          label: string
          short_desc: string | null
          sort: number | null
        }
        Insert: {
          key: string
          label: string
          short_desc?: string | null
          sort?: number | null
        }
        Update: {
          key?: string
          label?: string
          short_desc?: string | null
          sort?: number | null
        }
        Relationships: []
      }
      je_scenarios: {
        Row: {
          chapter_id: string | null
          chapter_topic_id: string | null
          created_at: string
          doc: Json
          id: string
          slug: string
          sort_order: number | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          chapter_topic_id?: string | null
          created_at?: string
          doc: Json
          id?: string
          slug: string
          sort_order?: number | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          chapter_topic_id?: string | null
          created_at?: string
          doc?: Json
          id?: string
          slug?: string
          sort_order?: number | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "je_scenarios_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "je_scenarios_chapter_topic_id_fkey"
            columns: ["chapter_topic_id"]
            isOneToOne: false
            referencedRelation: "chapter_topics"
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
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
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
      lesson_videos: {
        Row: {
          auphonic_uuid: string | null
          course_name: string | null
          created_at: string
          duration_sec: number | null
          error: string | null
          id: string
          intro_playback_id: string | null
          lesson_id: string
          lesson_label: string | null
          mux_asset_id: string | null
          mux_body_asset_id: string | null
          mux_body_playback_id: string | null
          outro_playback_id: string | null
          passthrough: string | null
          playback_id: string | null
          stage: string
          trimmed_intro_asset_id: string | null
          trimmed_intro_playback_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          auphonic_uuid?: string | null
          course_name?: string | null
          created_at?: string
          duration_sec?: number | null
          error?: string | null
          id?: string
          intro_playback_id?: string | null
          lesson_id: string
          lesson_label?: string | null
          mux_asset_id?: string | null
          mux_body_asset_id?: string | null
          mux_body_playback_id?: string | null
          outro_playback_id?: string | null
          passthrough?: string | null
          playback_id?: string | null
          stage?: string
          trimmed_intro_asset_id?: string | null
          trimmed_intro_playback_id?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          auphonic_uuid?: string | null
          course_name?: string | null
          created_at?: string
          duration_sec?: number | null
          error?: string | null
          id?: string
          intro_playback_id?: string | null
          lesson_id?: string
          lesson_label?: string | null
          mux_asset_id?: string | null
          mux_body_asset_id?: string | null
          mux_body_playback_id?: string | null
          outro_playback_id?: string | null
          passthrough?: string | null
          playback_id?: string | null
          stage?: string
          trimmed_intro_asset_id?: string | null
          trimmed_intro_playback_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      map_meta: {
        Row: {
          campus_id: string | null
          chapter_labels_on: boolean
          course_id: string
          created_at: string
          id: string
          professor_id: string | null
          status: string
          textbook_id: string | null
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          chapter_labels_on?: boolean
          course_id: string
          created_at?: string
          id?: string
          professor_id?: string | null
          status?: string
          textbook_id?: string | null
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          chapter_labels_on?: boolean
          course_id?: string
          created_at?: string
          id?: string
          professor_id?: string | null
          status?: string
          textbook_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      map_verification_files: {
        Row: {
          id: string
          inbound_file_id: string
          map_meta_id: string
        }
        Insert: {
          id?: string
          inbound_file_id: string
          map_meta_id: string
        }
        Update: {
          id?: string
          inbound_file_id?: string
          map_meta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_verification_files_inbound_file_id_fkey"
            columns: ["inbound_file_id"]
            isOneToOne: false
            referencedRelation: "inbound_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_verification_files_map_meta_id_fkey"
            columns: ["map_meta_id"]
            isOneToOne: false
            referencedRelation: "map_meta"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intel_identity_review: {
        Row: {
          best_ipeds_suggestion: string | null
          campus_id: string
          campus_name: string | null
          city: string | null
          resolved: boolean | null
          resolved_unitid: string | null
          review_reason: string | null
          state: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          best_ipeds_suggestion?: string | null
          campus_id: string
          campus_name?: string | null
          city?: string | null
          resolved?: boolean | null
          resolved_unitid?: string | null
          review_reason?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          best_ipeds_suggestion?: string | null
          campus_id?: string
          campus_name?: string | null
          city?: string | null
          resolved?: boolean | null
          resolved_unitid?: string | null
          review_reason?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_intel_identity_review_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "market_intel_identity_review_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intel_runs: {
        Row: {
          config_json: Json | null
          config_version: string
          created_at: string
          estimated_intro1_annual: number | null
          four_year_count: number | null
          generated_at: string
          id: string
          intro1_multiplier: number | null
          latest_data_year: number | null
          notes: string | null
          review_count: number | null
          total_business_completions: number | null
          universe_matched: number | null
        }
        Insert: {
          config_json?: Json | null
          config_version: string
          created_at?: string
          estimated_intro1_annual?: number | null
          four_year_count?: number | null
          generated_at?: string
          id?: string
          intro1_multiplier?: number | null
          latest_data_year?: number | null
          notes?: string | null
          review_count?: number | null
          total_business_completions?: number | null
          universe_matched?: number | null
        }
        Update: {
          config_json?: Json | null
          config_version?: string
          created_at?: string
          estimated_intro1_annual?: number | null
          four_year_count?: number | null
          generated_at?: string
          id?: string
          intro1_multiplier?: number | null
          latest_data_year?: number | null
          notes?: string | null
          review_count?: number | null
          total_business_completions?: number | null
          universe_matched?: number | null
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
      order_access_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          order_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          order_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          order_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_access_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_chapters: {
        Row: {
          chapter_id: string | null
          chapter_label: string
          chapter_number: number | null
          created_at: string
          id: string
          order_id: string
          position: number
          struggle_note: string | null
        }
        Insert: {
          chapter_id?: string | null
          chapter_label: string
          chapter_number?: number | null
          created_at?: string
          id?: string
          order_id: string
          position?: number
          struggle_note?: string | null
        }
        Update: {
          chapter_id?: string | null
          chapter_label?: string
          chapter_number?: number | null
          created_at?: string
          id?: string
          order_id?: string
          position?: number
          struggle_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_chapters_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_chapters_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_flow_copy: {
        Row: {
          copy: Json
          id: number
          updated_at: string
        }
        Insert: {
          copy?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          copy?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_media: {
        Row: {
          content_type: string | null
          from_phone: string | null
          id: string
          order_id: string | null
          received_at: string
          storage_path: string
        }
        Insert: {
          content_type?: string | null
          from_phone?: string | null
          id?: string
          order_id?: string | null
          received_at?: string
          storage_path: string
        }
        Update: {
          content_type?: string | null
          from_phone?: string | null
          id?: string
          order_id?: string | null
          received_at?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_media_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stage_events: {
        Row: {
          created_at: string
          id: string
          note: string | null
          order_id: string
          preview_url: string | null
          stage: string
          student_visible_message: string | null
          unlock_price_cents: number | null
          unlock_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          preview_url?: string | null
          stage: string
          student_visible_message?: string | null
          unlock_price_cents?: number | null
          unlock_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          preview_url?: string | null
          stage?: string
          student_visible_message?: string | null
          unlock_price_cents?: number | null
          unlock_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_stage_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          attachments_json: Json
          awaiting_syllabus: boolean
          campus_id: string | null
          campus_text: string | null
          chapter_count: number
          chapter_count_only: number | null
          chapter_priority_json: Json | null
          course_code: string | null
          course_family: string | null
          course_name: string | null
          created_at: string
          delivery_estimate_days: number | null
          delivery_target_date: string | null
          email: string
          estimated_build_minutes: number | null
          exam_date: string | null
          exam_timeframe: string | null
          first_name: string
          group_size: number | null
          id: string
          interested_in_group: boolean
          interests: string[] | null
          is_accounting_major: string | null
          is_waitlist: boolean
          last_name: string
          phone: string
          preview_url: string | null
          professor_lead_id: string | null
          professor_name: string | null
          promised_delivery_date: string | null
          quote_cents: number | null
          quoted_at: string | null
          referral_source: string | null
          referral_source_detail: string | null
          request_notes: string | null
          request_scope: string | null
          requested_options: Json
          rush: boolean
          rush_fee_cents: number
          short_ref: string
          source: string | null
          special_requests: string | null
          status: string
          subtotal_cents: number
          syllabus_received_at: string | null
          syllabus_url: string | null
          textbook_family_id: string | null
          textbook_name: string | null
          textbook_notes: string | null
          tier: string
          tool_exists: boolean | null
          total_cents: number
          triage_notes: string | null
          unlock_price_cents: number | null
          unlocked_at: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          attachments_json?: Json
          awaiting_syllabus?: boolean
          campus_id?: string | null
          campus_text?: string | null
          chapter_count?: number
          chapter_count_only?: number | null
          chapter_priority_json?: Json | null
          course_code?: string | null
          course_family?: string | null
          course_name?: string | null
          created_at?: string
          delivery_estimate_days?: number | null
          delivery_target_date?: string | null
          email: string
          estimated_build_minutes?: number | null
          exam_date?: string | null
          exam_timeframe?: string | null
          first_name: string
          group_size?: number | null
          id?: string
          interested_in_group?: boolean
          interests?: string[] | null
          is_accounting_major?: string | null
          is_waitlist?: boolean
          last_name: string
          phone: string
          preview_url?: string | null
          professor_lead_id?: string | null
          professor_name?: string | null
          promised_delivery_date?: string | null
          quote_cents?: number | null
          quoted_at?: string | null
          referral_source?: string | null
          referral_source_detail?: string | null
          request_notes?: string | null
          request_scope?: string | null
          requested_options?: Json
          rush?: boolean
          rush_fee_cents?: number
          short_ref?: string
          source?: string | null
          special_requests?: string | null
          status?: string
          subtotal_cents?: number
          syllabus_received_at?: string | null
          syllabus_url?: string | null
          textbook_family_id?: string | null
          textbook_name?: string | null
          textbook_notes?: string | null
          tier: string
          tool_exists?: boolean | null
          total_cents?: number
          triage_notes?: string | null
          unlock_price_cents?: number | null
          unlocked_at?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          attachments_json?: Json
          awaiting_syllabus?: boolean
          campus_id?: string | null
          campus_text?: string | null
          chapter_count?: number
          chapter_count_only?: number | null
          chapter_priority_json?: Json | null
          course_code?: string | null
          course_family?: string | null
          course_name?: string | null
          created_at?: string
          delivery_estimate_days?: number | null
          delivery_target_date?: string | null
          email?: string
          estimated_build_minutes?: number | null
          exam_date?: string | null
          exam_timeframe?: string | null
          first_name?: string
          group_size?: number | null
          id?: string
          interested_in_group?: boolean
          interests?: string[] | null
          is_accounting_major?: string | null
          is_waitlist?: boolean
          last_name?: string
          phone?: string
          preview_url?: string | null
          professor_lead_id?: string | null
          professor_name?: string | null
          promised_delivery_date?: string | null
          quote_cents?: number | null
          quoted_at?: string | null
          referral_source?: string | null
          referral_source_detail?: string | null
          request_notes?: string | null
          request_scope?: string | null
          requested_options?: Json
          rush?: boolean
          rush_fee_cents?: number
          short_ref?: string
          source?: string | null
          special_requests?: string | null
          status?: string
          subtotal_cents?: number
          syllabus_received_at?: string | null
          syllabus_url?: string | null
          textbook_family_id?: string | null
          textbook_name?: string | null
          textbook_notes?: string | null
          tier?: string
          tool_exists?: boolean | null
          total_cents?: number
          triage_notes?: string | null
          unlock_price_cents?: number | null
          unlocked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "orders_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_professor_lead_id_fkey"
            columns: ["professor_lead_id"]
            isOneToOne: false
            referencedRelation: "campus_lead_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_audiences: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          filters_json: Json | null
          id: string
          is_shared: boolean | null
          last_used_at: string | null
          name: string | null
          pinned_campus_ids: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters_json?: Json | null
          id?: string
          is_shared?: boolean | null
          last_used_at?: string | null
          name?: string | null
          pinned_campus_ids?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters_json?: Json | null
          id?: string
          is_shared?: boolean | null
          last_used_at?: string | null
          name?: string | null
          pinned_campus_ids?: string | null
          updated_at?: string | null
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
          campaign_id: string | null
          campus_id: string | null
          course_family: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lead_type: string | null
          outreach_lead_id: string | null
          scheduled_send_at: string | null
          sequence_step: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          campus_id?: string | null
          course_family?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_type?: string | null
          outreach_lead_id?: string | null
          scheduled_send_at?: string | null
          sequence_step?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          campus_id?: string | null
          course_family?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_type?: string | null
          outreach_lead_id?: string | null
          scheduled_send_at?: string | null
          sequence_step?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      outreach_campaigns: {
        Row: {
          audience_filters: string | null
          audience_id: string | null
          campaign_type: string | null
          created_at: string | null
          created_by: string | null
          daily_limit: string | null
          estimated_days: string | null
          id: string
          name: string | null
          status: string | null
          template_id: string | null
          total_campuses: string | null
          total_leads: string | null
          updated_at: string | null
        }
        Insert: {
          audience_filters?: string | null
          audience_id?: string | null
          campaign_type?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_limit?: string | null
          estimated_days?: string | null
          id?: string
          name?: string | null
          status?: string | null
          template_id?: string | null
          total_campuses?: string | null
          total_leads?: string | null
          updated_at?: string | null
        }
        Update: {
          audience_filters?: string | null
          audience_id?: string | null
          campaign_type?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_limit?: string | null
          estimated_days?: string | null
          id?: string
          name?: string | null
          status?: string | null
          template_id?: string | null
          total_campuses?: string | null
          total_leads?: string | null
          updated_at?: string | null
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
          lead_type: string
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
          lead_type?: string
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
          lead_type?: string
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
          bap_advisor_title: string | null
          bounced_at: string | null
          campus_id: string | null
          chapter_id: string | null
          clicks_count: number | null
          complained_at: string | null
          course_notes: string | null
          created_at: string
          delivered_at: string | null
          department: string | null
          email: string | null
          email_is_generic: boolean | null
          first_clicked_at: string | null
          first_name: string | null
          first_opened_at: string | null
          follow_up_1_sent_at: string | null
          follow_up_2_sent_at: string | null
          follow_up_3_sent_at: string | null
          id: string
          is_bap_advisor: boolean | null
          is_phd: boolean | null
          landing_token: string | null
          last_message_id: string | null
          last_name: string | null
          notes: string | null
          opens_count: number | null
          position: string | null
          replied_at: string | null
          rmp_checked_at: string | null
          rmp_course_codes: string[] | null
          rmp_course_match_count: number | null
          rmp_course_match_json: Json | null
          rmp_difficulty: number | null
          rmp_num_ratings: string | null
          rmp_profile_url: string | null
          rmp_rating: number | null
          rmp_would_take_again: string | null
          scheduled_send_at: string | null
          school_id: string | null
          sent_at: string | null
          sequence_stopped_at: string | null
          sequence_stopped_reason: string | null
          skip_landing_page: boolean | null
          source: string | null
          status: string | null
          term: string | null
          title_tags: string[] | null
          updated_at: string
        }
        Insert: {
          affiliation?: string | null
          bap_advisor_title?: string | null
          bounced_at?: string | null
          campus_id?: string | null
          chapter_id?: string | null
          clicks_count?: number | null
          complained_at?: string | null
          course_notes?: string | null
          created_at?: string
          delivered_at?: string | null
          department?: string | null
          email?: string | null
          email_is_generic?: boolean | null
          first_clicked_at?: string | null
          first_name?: string | null
          first_opened_at?: string | null
          follow_up_1_sent_at?: string | null
          follow_up_2_sent_at?: string | null
          follow_up_3_sent_at?: string | null
          id?: string
          is_bap_advisor?: boolean | null
          is_phd?: boolean | null
          landing_token?: string | null
          last_message_id?: string | null
          last_name?: string | null
          notes?: string | null
          opens_count?: number | null
          position?: string | null
          replied_at?: string | null
          rmp_checked_at?: string | null
          rmp_course_codes?: string[] | null
          rmp_course_match_count?: number | null
          rmp_course_match_json?: Json | null
          rmp_difficulty?: number | null
          rmp_num_ratings?: string | null
          rmp_profile_url?: string | null
          rmp_rating?: number | null
          rmp_would_take_again?: string | null
          scheduled_send_at?: string | null
          school_id?: string | null
          sent_at?: string | null
          sequence_stopped_at?: string | null
          sequence_stopped_reason?: string | null
          skip_landing_page?: boolean | null
          source?: string | null
          status?: string | null
          term?: string | null
          title_tags?: string[] | null
          updated_at?: string
        }
        Update: {
          affiliation?: string | null
          bap_advisor_title?: string | null
          bounced_at?: string | null
          campus_id?: string | null
          chapter_id?: string | null
          clicks_count?: number | null
          complained_at?: string | null
          course_notes?: string | null
          created_at?: string
          delivered_at?: string | null
          department?: string | null
          email?: string | null
          email_is_generic?: boolean | null
          first_clicked_at?: string | null
          first_name?: string | null
          first_opened_at?: string | null
          follow_up_1_sent_at?: string | null
          follow_up_2_sent_at?: string | null
          follow_up_3_sent_at?: string | null
          id?: string
          is_bap_advisor?: boolean | null
          is_phd?: boolean | null
          landing_token?: string | null
          last_message_id?: string | null
          last_name?: string | null
          notes?: string | null
          opens_count?: number | null
          position?: string | null
          replied_at?: string | null
          rmp_checked_at?: string | null
          rmp_course_codes?: string[] | null
          rmp_course_match_count?: number | null
          rmp_course_match_json?: Json | null
          rmp_difficulty?: number | null
          rmp_num_ratings?: string | null
          rmp_profile_url?: string | null
          rmp_rating?: number | null
          rmp_would_take_again?: string | null
          scheduled_send_at?: string | null
          school_id?: string | null
          sent_at?: string | null
          sequence_stopped_at?: string | null
          sequence_stopped_reason?: string | null
          skip_landing_page?: boolean | null
          source?: string | null
          status?: string | null
          term?: string | null
          title_tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_leads_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
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
          id: number
          square_booking_url_intermediate_1: string | null
          square_booking_url_intermediate_2: string | null
          square_booking_url_intro_1: string | null
          square_booking_url_intro_2: string | null
          updated_at: string
        }
        Insert: {
          auto_schedule_on_import?: boolean
          id?: number
          square_booking_url_intermediate_1?: string | null
          square_booking_url_intermediate_2?: string | null
          square_booking_url_intro_1?: string | null
          square_booking_url_intro_2?: string | null
          updated_at?: string
        }
        Update: {
          auto_schedule_on_import?: boolean
          id?: number
          square_booking_url_intermediate_1?: string | null
          square_booking_url_intermediate_2?: string | null
          square_booking_url_intro_1?: string | null
          square_booking_url_intro_2?: string | null
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
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
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
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
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
      parent_groups: {
        Row: {
          admin_notes: string | null
          campus_id: string | null
          cohort: string | null
          created_at: string
          id: string
          last_checked: string | null
          member_count: number | null
          membership_status: string
          name: string | null
          notes: string | null
          platform: string
          privacy: string | null
          screening_notes: string | null
          url: string | null
        }
        Insert: {
          admin_notes?: string | null
          campus_id?: string | null
          cohort?: string | null
          created_at?: string
          id?: string
          last_checked?: string | null
          member_count?: number | null
          membership_status?: string
          name?: string | null
          notes?: string | null
          platform?: string
          privacy?: string | null
          screening_notes?: string | null
          url?: string | null
        }
        Update: {
          admin_notes?: string | null
          campus_id?: string | null
          cohort?: string | null
          created_at?: string
          id?: string
          last_checked?: string | null
          member_count?: number | null
          membership_status?: string
          name?: string | null
          notes?: string | null
          platform?: string
          privacy?: string | null
          screening_notes?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_groups_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "parent_groups_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempts: {
        Row: {
          attempt_number: number
          campus: string | null
          ceq_id: string
          choice_id: string | null
          correct: boolean | null
          created_at: string
          event: string
          id: string
          is_test: boolean
          ms: number | null
          session_id: string
          set_id: string
          surface: string | null
          user_id: string | null
        }
        Insert: {
          attempt_number?: number
          campus?: string | null
          ceq_id: string
          choice_id?: string | null
          correct?: boolean | null
          created_at?: string
          event?: string
          id?: string
          is_test?: boolean
          ms?: number | null
          session_id: string
          set_id: string
          surface?: string | null
          user_id?: string | null
        }
        Update: {
          attempt_number?: number
          campus?: string | null
          ceq_id?: string
          choice_id?: string | null
          correct?: boolean | null
          created_at?: string
          event?: string
          id?: string
          is_test?: boolean
          ms?: number | null
          session_id?: string
          set_id?: string
          surface?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      preview_feedback: {
        Row: {
          chapter: string | null
          comment: string | null
          course: string | null
          created_at: string | null
          email: string
          id: string
          reaction: string | null
          source: string | null
        }
        Insert: {
          chapter?: string | null
          comment?: string | null
          course?: string | null
          created_at?: string | null
          email: string
          id?: string
          reaction?: string | null
          source?: string | null
        }
        Update: {
          chapter?: string | null
          comment?: string | null
          course?: string | null
          created_at?: string | null
          email?: string
          id?: string
          reaction?: string | null
          source?: string | null
        }
        Relationships: []
      }
      principles: {
        Row: {
          blurb: string | null
          created_at: string
          id: string
          kind: string
          name: string
          slug: string
          sort: number
        }
        Insert: {
          blurb?: string | null
          created_at?: string
          id?: string
          kind: string
          name: string
          slug: string
          sort?: number
        }
        Update: {
          blurb?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          slug?: string
          sort?: number
        }
        Relationships: []
      }
      probe_attempts: {
        Row: {
          correct: boolean | null
          created_at: string
          event: string
          exhibit_id: string
          id: string
          is_test: boolean
          ms: number | null
          probe_id: string
          ref_key: string
          response: string | null
          seed: string | null
          session_id: string
          step: string
          user_id: string | null
        }
        Insert: {
          correct?: boolean | null
          created_at?: string
          event?: string
          exhibit_id: string
          id?: string
          is_test?: boolean
          ms?: number | null
          probe_id: string
          ref_key: string
          response?: string | null
          seed?: string | null
          session_id: string
          step: string
          user_id?: string | null
        }
        Update: {
          correct?: boolean | null
          created_at?: string
          event?: string
          exhibit_id?: string
          id?: string
          is_test?: boolean
          ms?: number | null
          probe_id?: string
          ref_key?: string
          response?: string | null
          seed?: string | null
          session_id?: string
          step?: string
          user_id?: string | null
        }
        Relationships: []
      }
      professor_intro1_evidence: {
        Row: {
          campus_id: string
          confidence: string
          course_code: string | null
          created_at: string
          evidence_state: string
          id: string
          lead_suggestion_id: string | null
          professor_name: string
          raw_text: string | null
          source_document_id: string | null
          source_domain: string | null
          source_quality: string | null
          source_url: string | null
          term: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          campus_id: string
          confidence?: string
          course_code?: string | null
          created_at?: string
          evidence_state?: string
          id?: string
          lead_suggestion_id?: string | null
          professor_name: string
          raw_text?: string | null
          source_document_id?: string | null
          source_domain?: string | null
          source_quality?: string | null
          source_url?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          campus_id?: string
          confidence?: string
          course_code?: string | null
          created_at?: string
          evidence_state?: string
          id?: string
          lead_suggestion_id?: string | null
          professor_name?: string
          raw_text?: string | null
          source_document_id?: string | null
          source_domain?: string | null
          source_quality?: string | null
          source_url?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "professor_intro1_evidence_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "professor_intro1_evidence_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professor_intro1_evidence_lead_suggestion_id_fkey"
            columns: ["lead_suggestion_id"]
            isOneToOne: false
            referencedRelation: "campus_lead_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professor_intro1_evidence_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "course_document"
            referencedColumns: ["id"]
          },
        ]
      }
      profintel_reply_snippets: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      profintel_sends: {
        Row: {
          body: string | null
          campus_id: string | null
          click_count: number
          clicked_at: string | null
          course_matches: string | null
          created_at: string | null
          id: string
          last_clicked_url: string | null
          lead_id: string | null
          open_count: number | null
          opened_at: string | null
          profintel_score: number | null
          ready: boolean
          replied_at: string | null
          resend_message_id: string | null
          scheduled_at: string | null
          school: string | null
          send_error: string | null
          sent_at: string | null
          status: string
          stopped_at: string | null
          subject: string | null
          to_email: string | null
          to_name: string | null
          updated_at: string | null
          variant: string | null
        }
        Insert: {
          body?: string | null
          campus_id?: string | null
          click_count?: number
          clicked_at?: string | null
          course_matches?: string | null
          created_at?: string | null
          id?: string
          last_clicked_url?: string | null
          lead_id?: string | null
          open_count?: number | null
          opened_at?: string | null
          profintel_score?: number | null
          ready?: boolean
          replied_at?: string | null
          resend_message_id?: string | null
          scheduled_at?: string | null
          school?: string | null
          send_error?: string | null
          sent_at?: string | null
          status?: string
          stopped_at?: string | null
          subject?: string | null
          to_email?: string | null
          to_name?: string | null
          updated_at?: string | null
          variant?: string | null
        }
        Update: {
          body?: string | null
          campus_id?: string | null
          click_count?: number
          clicked_at?: string | null
          course_matches?: string | null
          created_at?: string | null
          id?: string
          last_clicked_url?: string | null
          lead_id?: string | null
          open_count?: number | null
          opened_at?: string | null
          profintel_score?: number | null
          ready?: boolean
          replied_at?: string | null
          resend_message_id?: string | null
          scheduled_at?: string | null
          school?: string | null
          send_error?: string | null
          sent_at?: string | null
          status?: string
          stopped_at?: string | null
          subject?: string | null
          to_email?: string | null
          to_name?: string | null
          updated_at?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profintel_sends_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "profintel_sends_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      profintel_settings: {
        Row: {
          daily_send_cap: number
          id: number
          last_run_at: string | null
          sending_enabled: boolean
          sent_today: number
          sent_today_date: string | null
          updated_at: string | null
          warmup_start_date: string | null
        }
        Insert: {
          daily_send_cap?: number
          id?: number
          last_run_at?: string | null
          sending_enabled?: boolean
          sent_today?: number
          sent_today_date?: string | null
          updated_at?: string | null
          warmup_start_date?: string | null
        }
        Update: {
          daily_send_cap?: number
          id?: number
          last_run_at?: string | null
          sending_enabled?: boolean
          sent_today?: number
          sent_today_date?: string | null
          updated_at?: string | null
          warmup_start_date?: string | null
        }
        Relationships: []
      }
      profintel_template: {
        Row: {
          ab_enabled: boolean
          body: string
          body_b: string | null
          id: number
          subject: string
          subject_b: string | null
          updated_at: string | null
        }
        Insert: {
          ab_enabled?: boolean
          body?: string
          body_b?: string | null
          id?: number
          subject?: string
          subject_b?: string | null
          updated_at?: string | null
        }
        Update: {
          ab_enabled?: boolean
          body?: string
          body_b?: string | null
          id?: number
          subject?: string
          subject_b?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      qa_verifications: {
        Row: {
          created_at: string
          note: string | null
          pinned_examples: Json
          template_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          verified_sha: string | null
          verified_version: string | null
        }
        Insert: {
          created_at?: string
          note?: string | null
          pinned_examples?: Json
          template_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_sha?: string | null
          verified_version?: string | null
        }
        Update: {
          created_at?: string
          note?: string | null
          pinned_examples?: Json
          template_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_sha?: string | null
          verified_version?: string | null
        }
        Relationships: []
      }
      reddit_mentions: {
        Row: {
          author: string | null
          campus_id: string | null
          found_at: string
          id: string
          is_accounting_major: boolean | null
          matched_terms: string[]
          notes: string | null
          post_id: string
          posted_at: string | null
          sent_via: string[]
          snippet: string | null
          starred: boolean
          status: string
          subreddit: string | null
          taking_course: string | null
          taking_term: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          author?: string | null
          campus_id?: string | null
          found_at?: string
          id?: string
          is_accounting_major?: boolean | null
          matched_terms?: string[]
          notes?: string | null
          post_id: string
          posted_at?: string | null
          sent_via?: string[]
          snippet?: string | null
          starred?: boolean
          status?: string
          subreddit?: string | null
          taking_course?: string | null
          taking_term?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          author?: string | null
          campus_id?: string | null
          found_at?: string
          id?: string
          is_accounting_major?: boolean | null
          matched_terms?: string[]
          notes?: string | null
          post_id?: string
          posted_at?: string | null
          sent_via?: string[]
          snippet?: string | null
          starred?: boolean
          status?: string
          subreddit?: string | null
          taking_course?: string | null
          taking_term?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reddit_mentions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "reddit_mentions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          anon_id: string | null
          code: string
          id: number
          ip_hash: string | null
          is_bot: boolean
          is_test: boolean
          link_id: string
          meta: Json | null
          occurred_at: string
          referer: string | null
          user_agent: string | null
        }
        Insert: {
          anon_id?: string | null
          code: string
          id?: number
          ip_hash?: string | null
          is_bot?: boolean
          is_test?: boolean
          link_id: string
          meta?: Json | null
          occurred_at?: string
          referer?: string | null
          user_agent?: string | null
        }
        Update: {
          anon_id?: string | null
          code?: string
          id?: number
          ip_hash?: string | null
          is_bot?: boolean
          is_test?: boolean
          link_id?: string
          meta?: Json | null
          occurred_at?: string
          referer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_commissions: {
        Row: {
          basis_cents: number
          commission_cents: number
          commission_rate: number
          commission_type: string
          conversion_id: string | null
          created_at: string
          id: string
          is_test: boolean
          link_id: string | null
          notes: string | null
          partner_id: string
          status: string
          status_changed_at: string
          status_changed_by: string | null
        }
        Insert: {
          basis_cents?: number
          commission_cents?: number
          commission_rate?: number
          commission_type: string
          conversion_id?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          link_id?: string | null
          notes?: string | null
          partner_id: string
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
        }
        Update: {
          basis_cents?: number
          commission_cents?: number
          commission_rate?: number
          commission_type?: string
          conversion_id?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          link_id?: string | null
          notes?: string | null
          partner_id?: string
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: true
            referencedRelation: "referral_conversions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_conversions: {
        Row: {
          amount_cents: number
          anon_id: string | null
          attribution_model: string
          code: string | null
          email: string | null
          id: string
          is_test: boolean
          kind: string
          link_id: string | null
          meta: Json | null
          occurred_at: string
          partner_id: string | null
          subject_id: string | null
          subject_type: string | null
          user_id: string | null
        }
        Insert: {
          amount_cents?: number
          anon_id?: string | null
          attribution_model?: string
          code?: string | null
          email?: string | null
          id?: string
          is_test?: boolean
          kind: string
          link_id?: string | null
          meta?: Json | null
          occurred_at?: string
          partner_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          anon_id?: string | null
          attribution_model?: string
          code?: string | null
          email?: string | null
          id?: string
          is_test?: boolean
          kind?: string
          link_id?: string | null
          meta?: Json | null
          occurred_at?: string
          partner_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_conversions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_conversions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_links: {
        Row: {
          active: boolean
          campaign: string | null
          code: string
          commission_rate: number | null
          commission_type: string | null
          created_at: string
          created_by: string | null
          destination_url: string
          id: string
          is_test: boolean
          label: string | null
          partner_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          active?: boolean
          campaign?: string | null
          code: string
          commission_rate?: number | null
          commission_type?: string | null
          created_at?: string
          created_by?: string | null
          destination_url: string
          id?: string
          is_test?: boolean
          label?: string | null
          partner_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          active?: boolean
          campaign?: string | null
          code?: string
          commission_rate?: number | null
          commission_type?: string | null
          created_at?: string
          created_by?: string | null
          destination_url?: string
          id?: string
          is_test?: boolean
          label?: string | null
          partner_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_partners: {
        Row: {
          campus_id: string | null
          created_at: string
          created_by: string | null
          dashboard_token: string | null
          default_commission_rate: number
          default_commission_type: string
          email: string | null
          id: string
          is_test: boolean
          name: string
          notes: string | null
          phone: string | null
          social_handle: string | null
          status: string
          type: string
          updated_at: string
          venmo: string | null
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          created_by?: string | null
          dashboard_token?: string | null
          default_commission_rate?: number
          default_commission_type?: string
          email?: string | null
          id?: string
          is_test?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          social_handle?: string | null
          status?: string
          type?: string
          updated_at?: string
          venmo?: string | null
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          created_by?: string | null
          dashboard_token?: string | null
          default_commission_rate?: number
          default_commission_type?: string
          email?: string | null
          id?: string
          is_test?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          social_handle?: string | null
          status?: string
          type?: string
          updated_at?: string
          venmo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_partners_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "referral_partners_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          id: string
          ok_to_name: boolean
          raw_text: string
          referrer_email: string | null
          submitted_at: string
        }
        Insert: {
          id?: string
          ok_to_name?: boolean
          raw_text: string
          referrer_email?: string | null
          submitted_at?: string
        }
        Update: {
          id?: string
          ok_to_name?: boolean
          raw_text?: string
          referrer_email?: string | null
          submitted_at?: string
        }
        Relationships: []
      }
      rmp_ratings: {
        Row: {
          campus_id: string | null
          class_label: string | null
          comment: string | null
          difficulty: number | null
          grade: string | null
          id: string
          lead_id: string | null
          rated_at: string | null
          raw_json: Json | null
          rmp_rating_id: string | null
          scraped_at: string | null
          would_take_again: number | null
        }
        Insert: {
          campus_id?: string | null
          class_label?: string | null
          comment?: string | null
          difficulty?: number | null
          grade?: string | null
          id?: string
          lead_id?: string | null
          rated_at?: string | null
          raw_json?: Json | null
          rmp_rating_id?: string | null
          scraped_at?: string | null
          would_take_again?: number | null
        }
        Update: {
          campus_id?: string | null
          class_label?: string | null
          comment?: string | null
          difficulty?: number | null
          grade?: string | null
          id?: string
          lead_id?: string | null
          rated_at?: string | null
          raw_json?: Json | null
          rmp_rating_id?: string | null
          scraped_at?: string | null
          would_take_again?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rmp_ratings_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "rmp_ratings_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rmp_ratings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "campus_lead_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_placements: {
        Row: {
          chapter_id: string
          course_id: string
          created_at: string
          id: string
          scenario_id: string
          sort_order: number
        }
        Insert: {
          chapter_id: string
          course_id: string
          created_at?: string
          id?: string
          scenario_id: string
          sort_order?: number
        }
        Update: {
          chapter_id?: string
          course_id?: string
          created_at?: string
          id?: string
          scenario_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_placements_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_placements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_placements_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "je_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_principles: {
        Row: {
          created_at: string
          principle_id: string
          scenario_id: string
        }
        Insert: {
          created_at?: string
          principle_id: string
          scenario_id: string
        }
        Update: {
          created_at?: string
          principle_id?: string
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_principles_principle_id_fkey"
            columns: ["principle_id"]
            isOneToOne: false
            referencedRelation: "principles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_principles_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "je_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      school_demand_log: {
        Row: {
          created_at: string
          email: string | null
          id: string
          raw_text: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          raw_text?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          raw_text?: string | null
        }
        Relationships: []
      }
      scrape_batches: {
        Row: {
          actual_cost_usd: number
          campus_count: number
          campus_ids: Json
          created_at: string
          est_cost_usd: number
          id: string
          leads_inserted: number
          notes: string | null
          status: string
          vertical: string
        }
        Insert: {
          actual_cost_usd?: number
          campus_count?: number
          campus_ids?: Json
          created_at?: string
          est_cost_usd?: number
          id?: string
          leads_inserted?: number
          notes?: string | null
          status?: string
          vertical?: string
        }
        Update: {
          actual_cost_usd?: number
          campus_count?: number
          campus_ids?: Json
          created_at?: string
          est_cost_usd?: number
          id?: string
          leads_inserted?: number
          notes?: string | null
          status?: string
          vertical?: string
        }
        Relationships: []
      }
      scrape_cache: {
        Row: {
          cache_key: string
          created_at: string
          kind: string
          value: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          kind: string
          value: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          kind?: string
          value?: Json
        }
        Relationships: []
      }
      scrape_debug_bundles: {
        Row: {
          campus_id: string | null
          campus_name: string | null
          contacts_inserted: string | null
          contacts_with_email: string | null
          created_at: string | null
          credits_estimate_usd: string | null
          duration_ms: string | null
          host_fail_count: number | null
          id: string
          kind: string | null
          map_fallback_used: string | null
          news_filter_hits: string | null
          pagination_walked: string | null
          payload: string | null
          scrape_job_id: string | null
          summary: string | null
          urls_attempted: string | null
        }
        Insert: {
          campus_id?: string | null
          campus_name?: string | null
          contacts_inserted?: string | null
          contacts_with_email?: string | null
          created_at?: string | null
          credits_estimate_usd?: string | null
          duration_ms?: string | null
          host_fail_count?: number | null
          id?: string
          kind?: string | null
          map_fallback_used?: string | null
          news_filter_hits?: string | null
          pagination_walked?: string | null
          payload?: string | null
          scrape_job_id?: string | null
          summary?: string | null
          urls_attempted?: string | null
        }
        Update: {
          campus_id?: string | null
          campus_name?: string | null
          contacts_inserted?: string | null
          contacts_with_email?: string | null
          created_at?: string | null
          credits_estimate_usd?: string | null
          duration_ms?: string | null
          host_fail_count?: number | null
          id?: string
          kind?: string | null
          map_fallback_used?: string | null
          news_filter_hits?: string | null
          pagination_walked?: string | null
          payload?: string | null
          scrape_job_id?: string | null
          summary?: string | null
          urls_attempted?: string | null
        }
        Relationships: []
      }
      scrape_improvement_suggestions: {
        Row: {
          applies_to_verticals: string | null
          bundle_id: string | null
          campus_id: string | null
          campus_name: string | null
          created_at: string | null
          id: string
          milestone_id: string | null
          model: string | null
          pattern_tag: string | null
          raw: string | null
          severity: string | null
          shipped_at: string | null
          suggestion: string | null
          title: string | null
        }
        Insert: {
          applies_to_verticals?: string | null
          bundle_id?: string | null
          campus_id?: string | null
          campus_name?: string | null
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          model?: string | null
          pattern_tag?: string | null
          raw?: string | null
          severity?: string | null
          shipped_at?: string | null
          suggestion?: string | null
          title?: string | null
        }
        Update: {
          applies_to_verticals?: string | null
          bundle_id?: string | null
          campus_id?: string | null
          campus_name?: string | null
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          model?: string | null
          pattern_tag?: string | null
          raw?: string | null
          severity?: string | null
          shipped_at?: string | null
          suggestion?: string | null
          title?: string | null
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          campus_id: string | null
          campus_name: string | null
          created_at: string | null
          finished_at: string | null
          id: string
          kind: string | null
          message: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          campus_id?: string | null
          campus_name?: string | null
          created_at?: string | null
          finished_at?: string | null
          id?: string
          kind?: string | null
          message?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          campus_id?: string | null
          campus_name?: string | null
          created_at?: string | null
          finished_at?: string | null
          id?: string
          kind?: string | null
          message?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      scraper_fix_milestones: {
        Row: {
          created_at: string | null
          deployed_at: string | null
          description: string | null
          id: string
          name: string | null
          suggestion_id: string | null
          tags: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deployed_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          suggestion_id?: string | null
          tags?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deployed_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          suggestion_id?: string | null
          tags?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      scraper_performance_verdicts: {
        Row: {
          created_at: string | null
          fix_attribution: string | null
          id: string
          metrics_snapshot: string | null
          model: string | null
          summary: string | null
          vertical_applicability: string | null
          what_changed: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          fix_attribution?: string | null
          id?: string
          metrics_snapshot?: string | null
          model?: string | null
          summary?: string | null
          vertical_applicability?: string | null
          what_changed?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          fix_attribution?: string | null
          id?: string
          metrics_snapshot?: string | null
          model?: string | null
          summary?: string | null
          vertical_applicability?: string | null
          what_changed?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      scraper_projects: {
        Row: {
          assignee: string | null
          created_at: string
          description: string | null
          id: string
          links: Json
          name: string
          notes: string | null
          status: string
          updated_at: string
          vertical: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          id?: string
          links?: Json
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
          vertical?: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          id?: string
          links?: Json
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          vertical?: string
        }
        Relationships: []
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
      site_settings: {
        Row: {
          id: number
          settings: Json
          updated_at: string
        }
        Insert: {
          id?: number
          settings?: Json
          updated_at?: string
        }
        Update: {
          id?: number
          settings?: Json
          updated_at?: string
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
          last_auto_reply_at: string | null
          last_message_at: string
          major: string | null
          opener_sent: boolean
          sentiment: string | null
          short_ref: number
          status: string
          struggles: string | null
          student_phone: string
          submission_id: string | null
        }
        Insert: {
          campus_id?: string | null
          campus_number: string
          course?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          last_auto_reply_at?: string | null
          last_message_at?: string
          major?: string | null
          opener_sent?: boolean
          sentiment?: string | null
          short_ref?: number
          status?: string
          struggles?: string | null
          student_phone: string
          submission_id?: string | null
        }
        Update: {
          campus_id?: string | null
          campus_number?: string
          course?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          last_auto_reply_at?: string | null
          last_message_at?: string
          major?: string | null
          opener_sent?: boolean
          sentiment?: string | null
          short_ref?: number
          status?: string
          struggles?: string | null
          student_phone?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "sms_conversations_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_conversations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "student_intake_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_inbound_raw: {
        Row: {
          body: string | null
          conversation_id: string | null
          error: string | null
          from_number: string | null
          id: string
          parse_status: string | null
          raw_payload: Json | null
          received_at: string | null
          to_number: string | null
          twilio_sid: string | null
        }
        Insert: {
          body?: string | null
          conversation_id?: string | null
          error?: string | null
          from_number?: string | null
          id?: string
          parse_status?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          to_number?: string | null
          twilio_sid?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string | null
          error?: string | null
          from_number?: string | null
          id?: string
          parse_status?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          to_number?: string | null
          twilio_sid?: string | null
        }
        Relationships: []
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
      sms_templates: {
        Row: {
          body: string | null
          description: string | null
          key: string | null
          label: string | null
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          description?: string | null
          key?: string | null
          label?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          description?: string | null
          key?: string | null
          label?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      student_entitlements: {
        Row: {
          campus_id: string | null
          granted_at: string
          id: string
          is_test: boolean
          kind: string
          meta: Json | null
          revoked_at: string | null
          source: string
          stripe_customer_id: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          campus_id?: string | null
          granted_at?: string
          id?: string
          is_test?: boolean
          kind: string
          meta?: Json | null
          revoked_at?: string | null
          source: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          campus_id?: string | null
          granted_at?: string
          id?: string
          is_test?: boolean
          kind?: string
          meta?: Json | null
          revoked_at?: string | null
          source?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_entitlements_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "student_entitlements_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      student_intake_submissions: {
        Row: {
          accounting_major_status: string | null
          archived_by_lee: string | null
          booking_confirmed_at: string | null
          booking_link_shown: string | null
          booking_step_completed_at: string | null
          campus_id: string | null
          contact_info_completed_at: string | null
          course_code_or_name: string | null
          course_family: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          future_interests: string | null
          future_interests_completed_at: string | null
          greek_completed_at: string | null
          greek_org_name: string | null
          how_did_you_hear_about_me: string | null
          id: string
          is_accounting_major: boolean | null
          is_greek_member: boolean | null
          last_name: string | null
          next_exam_date: string | null
          notes: string | null
          notification_log: string | null
          onboarding_finished_at: string | null
          onboarding_opened_at: string | null
          phone: string | null
          pricing_reaction: string | null
          professor_name: string | null
          replied_by_lee: string | null
          required_onboarding_completed_at: string | null
          routing_reason: string | null
          routing_result: string | null
          school_name: string | null
          source: string | null
          source_campaign_id: string | null
          source_lead_id: string | null
          source_url_params: string | null
          stress_factors: string | null
          syllabus_file_url: string | null
          syllabus_step_completed_at: string | null
          syllabus_uploaded_at: string | null
          updated_at: string | null
          waitlist_joined: string | null
        }
        Insert: {
          accounting_major_status?: string | null
          archived_by_lee?: string | null
          booking_confirmed_at?: string | null
          booking_link_shown?: string | null
          booking_step_completed_at?: string | null
          campus_id?: string | null
          contact_info_completed_at?: string | null
          course_code_or_name?: string | null
          course_family?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          future_interests?: string | null
          future_interests_completed_at?: string | null
          greek_completed_at?: string | null
          greek_org_name?: string | null
          how_did_you_hear_about_me?: string | null
          id?: string
          is_accounting_major?: boolean | null
          is_greek_member?: boolean | null
          last_name?: string | null
          next_exam_date?: string | null
          notes?: string | null
          notification_log?: string | null
          onboarding_finished_at?: string | null
          onboarding_opened_at?: string | null
          phone?: string | null
          pricing_reaction?: string | null
          professor_name?: string | null
          replied_by_lee?: string | null
          required_onboarding_completed_at?: string | null
          routing_reason?: string | null
          routing_result?: string | null
          school_name?: string | null
          source?: string | null
          source_campaign_id?: string | null
          source_lead_id?: string | null
          source_url_params?: string | null
          stress_factors?: string | null
          syllabus_file_url?: string | null
          syllabus_step_completed_at?: string | null
          syllabus_uploaded_at?: string | null
          updated_at?: string | null
          waitlist_joined?: string | null
        }
        Update: {
          accounting_major_status?: string | null
          archived_by_lee?: string | null
          booking_confirmed_at?: string | null
          booking_link_shown?: string | null
          booking_step_completed_at?: string | null
          campus_id?: string | null
          contact_info_completed_at?: string | null
          course_code_or_name?: string | null
          course_family?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          future_interests?: string | null
          future_interests_completed_at?: string | null
          greek_completed_at?: string | null
          greek_org_name?: string | null
          how_did_you_hear_about_me?: string | null
          id?: string
          is_accounting_major?: boolean | null
          is_greek_member?: boolean | null
          last_name?: string | null
          next_exam_date?: string | null
          notes?: string | null
          notification_log?: string | null
          onboarding_finished_at?: string | null
          onboarding_opened_at?: string | null
          phone?: string | null
          pricing_reaction?: string | null
          professor_name?: string | null
          replied_by_lee?: string | null
          required_onboarding_completed_at?: string | null
          routing_reason?: string | null
          routing_result?: string | null
          school_name?: string | null
          source?: string | null
          source_campaign_id?: string | null
          source_lead_id?: string | null
          source_url_params?: string | null
          stress_factors?: string | null
          syllabus_file_url?: string | null
          syllabus_step_completed_at?: string | null
          syllabus_uploaded_at?: string | null
          updated_at?: string | null
          waitlist_joined?: string | null
        }
        Relationships: []
      }
      student_set_progress: {
        Row: {
          duration_sec: number | null
          position_sec: number
          set_id: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          duration_sec?: number | null
          position_sec?: number
          set_id: string
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          duration_sec?: number | null
          position_sec?: number
          set_id?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      supported_textbook_families: {
        Row: {
          active: string | null
          author_keywords: string | null
          course_family: string | null
          created_at: string | null
          edition_sensitive: string | null
          id: string
          isbn13_prefixes: string | null
          label: string | null
          notes: string | null
          publisher_keywords: string | null
          title_keywords: string | null
          updated_at: string | null
        }
        Insert: {
          active?: string | null
          author_keywords?: string | null
          course_family?: string | null
          created_at?: string | null
          edition_sensitive?: string | null
          id?: string
          isbn13_prefixes?: string | null
          label?: string | null
          notes?: string | null
          publisher_keywords?: string | null
          title_keywords?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: string | null
          author_keywords?: string | null
          course_family?: string | null
          created_at?: string | null
          edition_sensitive?: string | null
          id?: string
          isbn13_prefixes?: string | null
          label?: string | null
          notes?: string | null
          publisher_keywords?: string | null
          title_keywords?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      syllabus_submissions: {
        Row: {
          campus_id: string | null
          campus_name: string | null
          created_at: string
          email: string
          file_names: string[]
          file_paths: string[]
          id: string
          note: string | null
          professor_name: string | null
          source: string | null
          status: string
        }
        Insert: {
          campus_id?: string | null
          campus_name?: string | null
          created_at?: string
          email: string
          file_names?: string[]
          file_paths?: string[]
          id?: string
          note?: string | null
          professor_name?: string | null
          source?: string | null
          status?: string
        }
        Update: {
          campus_id?: string | null
          campus_name?: string | null
          created_at?: string
          email?: string
          file_names?: string[]
          file_paths?: string[]
          id?: string
          note?: string | null
          professor_name?: string | null
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_submissions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "syllabus_submissions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      take_transcripts: {
        Row: {
          created_at: string
          duration_s: number | null
          lang: string | null
          model: string
          take_path: string
          text: string
          words: Json
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          lang?: string | null
          model: string
          take_path: string
          text?: string
          words?: Json
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          lang?: string | null
          model?: string
          take_path?: string
          text?: string
          words?: Json
        }
        Relationships: []
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
      test_mode_activity: {
        Row: {
          created_at: string
          detail: string | null
          event: string
          id: number
          meta: Json | null
          session_key: string
          status: string
          step: string | null
          tester_email: string | null
          tester_name: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event: string
          id?: number
          meta?: Json | null
          session_key: string
          status?: string
          step?: string | null
          tester_email?: string | null
          tester_name?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          event?: string
          id?: number
          meta?: Json | null
          session_key?: string
          status?: string
          step?: string | null
          tester_email?: string | null
          tester_name?: string | null
        }
        Relationships: []
      }
      textbook_chapter_topic_mapping: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          confidence: string
          created_at: string
          id: string
          problem_type: string | null
          proposed_by: string | null
          reason: string | null
          source: string | null
          state: string
          superseded_by: string | null
          survive_topic_id: string | null
          survive_topic_label: string
          textbook_chapter_id: string
          textbook_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confidence?: string
          created_at?: string
          id?: string
          problem_type?: string | null
          proposed_by?: string | null
          reason?: string | null
          source?: string | null
          state?: string
          superseded_by?: string | null
          survive_topic_id?: string | null
          survive_topic_label: string
          textbook_chapter_id: string
          textbook_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confidence?: string
          created_at?: string
          id?: string
          problem_type?: string | null
          proposed_by?: string | null
          reason?: string | null
          source?: string | null
          state?: string
          superseded_by?: string | null
          survive_topic_id?: string | null
          survive_topic_label?: string
          textbook_chapter_id?: string
          textbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "textbook_chapter_topic_mapping_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "textbook_chapter_topic_mapping"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "textbook_chapter_topic_mapping_survive_topic_id_fkey"
            columns: ["survive_topic_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "textbook_chapter_topic_mapping_textbook_chapter_id_fkey"
            columns: ["textbook_chapter_id"]
            isOneToOne: false
            referencedRelation: "textbook_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "textbook_chapter_topic_mapping_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      textbook_chapters: {
        Row: {
          chapter_key: string
          id: string
          number: number
          position: number
          textbook_id: string
          title: string
        }
        Insert: {
          chapter_key: string
          id?: string
          number: number
          position?: number
          textbook_id: string
          title?: string
        }
        Update: {
          chapter_key?: string
          id?: string
          number?: number
          position?: number
          textbook_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "textbook_chapters_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      textbooks: {
        Row: {
          authors: string | null
          created_at: string
          edition: string | null
          edition_confirmed: boolean
          edition_key: string | null
          id: string
          isbn: string | null
          isbn13: string | null
          publisher: string | null
          title: string | null
          toc_source_url: string | null
          updated_at: string
        }
        Insert: {
          authors?: string | null
          created_at?: string
          edition?: string | null
          edition_confirmed?: boolean
          edition_key?: string | null
          id?: string
          isbn?: string | null
          isbn13?: string | null
          publisher?: string | null
          title?: string | null
          toc_source_url?: string | null
          updated_at?: string
        }
        Update: {
          authors?: string | null
          created_at?: string
          edition?: string | null
          edition_confirmed?: boolean
          edition_key?: string | null
          id?: string
          isbn?: string | null
          isbn13?: string | null
          publisher?: string | null
          title?: string | null
          toc_source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number | null
          status: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
          status?: string
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
          status?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      tutoring_requests: {
        Row: {
          admin_notes: string | null
          course_notes: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          phone: string | null
          status: string | null
          syllabus_file_url: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          course_notes?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          status?: string | null
          syllabus_file_url?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          course_notes?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          status?: string | null
          syllabus_file_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      unit_textbook_links: {
        Row: {
          chapter_key: string
          id: string
          textbook_id: string
          unit_id: string
        }
        Insert: {
          chapter_key: string
          id?: string
          textbook_id: string
          unit_id: string
        }
        Update: {
          chapter_key?: string
          id?: string
          textbook_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_textbook_links_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_textbook_links_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "chapters"
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
      vendor_lists: {
        Row: {
          found_at: string
          id: string
          list_type: string
          national_org: string
          notes: string | null
          pdf_storage_path: string | null
          url: string | null
        }
        Insert: {
          found_at?: string
          id?: string
          list_type?: string
          national_org: string
          notes?: string | null
          pdf_storage_path?: string | null
          url?: string | null
        }
        Update: {
          found_at?: string
          id?: string
          list_type?: string
          national_org?: string
          notes?: string | null
          pdf_storage_path?: string | null
          url?: string | null
        }
        Relationships: []
      }
      video_archive: {
        Row: {
          chapter_id: string | null
          chapter_number: number | null
          classification_confidence: number | null
          classification_model: string | null
          classification_reasoning: string | null
          classified_at: string | null
          course_family: string | null
          created_at: string
          created_at_source: string | null
          description: string | null
          duration_sec: number | null
          id: string
          mux_asset_id: string | null
          mux_playback_id: string | null
          needs_review: boolean
          notes: string | null
          scenario_slug: string | null
          source: string
          source_video_id: string
          status: string
          title: string | null
          transcript_source: string | null
          transcript_text: string | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          chapter_number?: number | null
          classification_confidence?: number | null
          classification_model?: string | null
          classification_reasoning?: string | null
          classified_at?: string | null
          course_family?: string | null
          created_at?: string
          created_at_source?: string | null
          description?: string | null
          duration_sec?: number | null
          id?: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          needs_review?: boolean
          notes?: string | null
          scenario_slug?: string | null
          source: string
          source_video_id: string
          status?: string
          title?: string | null
          transcript_source?: string | null
          transcript_text?: string | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          chapter_number?: number | null
          classification_confidence?: number | null
          classification_model?: string | null
          classification_reasoning?: string | null
          classified_at?: string | null
          course_family?: string | null
          created_at?: string
          created_at_source?: string | null
          description?: string | null
          duration_sec?: number | null
          id?: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          needs_review?: boolean
          notes?: string | null
          scenario_slug?: string | null
          source?: string
          source_video_id?: string
          status?: string
          title?: string | null
          transcript_source?: string | null
          transcript_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      campus_market_intelligence_card: {
        Row: {
          action_suppressed: boolean | null
          business_bachelors: number | null
          business_growth_5y: number | null
          campus: string | null
          campus_id: string | null
          councils_present: string[] | null
          course_readiness_score: number | null
          course_readiness_status: string | null
          distribution_data_completeness: number | null
          distribution_strength_score: number | null
          enrichment_priority_score: number | null
          estimated_intro1_annual: number | null
          generated_at: string | null
          greek_chapters: number | null
          growth_label: string | null
          growth_momentum_score: number | null
          ipeds_unitid: string | null
          live_demand_status: string | null
          market_data_completeness: number | null
          market_opportunity_score: number | null
          outreach_priority_score: number | null
          recommended_next_action: string | null
          segment: string | null
          state: string | null
          top_drivers: Json | null
        }
        Relationships: []
      }
      greek_academic_campus_summary_v: {
        Row: {
          archive_url: string | null
          business_records: number | null
          campus_id: string | null
          campus_name: string | null
          chapters_matched: number | null
          chapters_unmatched: number | null
          chapters_with_gpa_data: number | null
          greek_academic_data_status: string | null
          greek_business_students_count: number | null
          greek_members_reported: number | null
          greek_members_reported_rows: number | null
          high_need_ifc_chapters: number | null
          high_need_panhellenic_chapters: number | null
          historical_terms_available: number | null
          ifc_average_gpa: number | null
          ifc_chapters_with_data: number | null
          ifc_members_reported: number | null
          last_error: string | null
          latest_greek_academic_term: string | null
          latest_greek_academic_year: number | null
          panhellenic_average_gpa: number | null
          panhellenic_chapters_with_data: number | null
          panhellenic_members_reported: number | null
          recommended_next_action: string | null
          reports_found: number | null
          state: string | null
        }
        Relationships: [
          {
            foreignKeyName: "greek_academic_campus_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus_market_intelligence_card"
            referencedColumns: ["campus_id"]
          },
          {
            foreignKeyName: "greek_academic_campus_status_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_outreach_eligibility: {
        Row: {
          campaign_purpose: string | null
          campus_id: string | null
          chapter_id: string | null
          confidence: string | null
          contact_id: string | null
          contact_source: string | null
          contact_type: string | null
          council_id: string | null
          council_type: string | null
          effective_term: string | null
          effective_year: number | null
          email: string | null
          freshness_status: string | null
          instagram: string | null
          last_verified: string | null
          name: string | null
          org_id: string | null
          outreach_eligible: boolean | null
          qc_action: string | null
          qc_id: string | null
          review_reason: string | null
          role: string | null
          source: string | null
          source_type: string | null
        }
        Insert: {
          campaign_purpose?: string | null
          campus_id?: string | null
          chapter_id?: never
          confidence?: string | null
          contact_id?: string | null
          contact_source?: string | null
          contact_type?: string | null
          council_id?: never
          council_type?: string | null
          effective_term?: string | null
          effective_year?: number | null
          email?: string | null
          freshness_status?: string | null
          instagram?: string | null
          last_verified?: string | null
          name?: string | null
          org_id?: never
          outreach_eligible?: boolean | null
          qc_action?: string | null
          qc_id?: string | null
          review_reason?: string | null
          role?: string | null
          source?: string | null
          source_type?: string | null
        }
        Update: {
          campaign_purpose?: string | null
          campus_id?: string | null
          chapter_id?: never
          confidence?: string | null
          contact_id?: string | null
          contact_source?: string | null
          contact_type?: string | null
          council_id?: never
          council_type?: string | null
          effective_term?: string | null
          effective_year?: number | null
          email?: string | null
          freshness_status?: string | null
          instagram?: string | null
          last_verified?: string | null
          name?: string | null
          org_id?: never
          outreach_eligible?: boolean | null
          qc_action?: string | null
          qc_id?: string | null
          review_reason?: string | null
          role?: string | null
          source?: string | null
          source_type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      growth_approve_map: {
        Args: {
          p_approved_by: string
          p_campus_id: string
          p_course_id: string
          p_exams: Json
          p_professor_id: string
          p_source?: Json
          p_textbook_id: string
        }
        Returns: Json
      }
      growth_revert_map: {
        Args: {
          p_approved_by: string
          p_campus_id: string
          p_course_id: string
          p_professor_id: string
        }
        Returns: Json
      }
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
