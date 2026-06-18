
-- Enums
CREATE TYPE public.greek_org_type AS ENUM ('fraternity', 'sorority');
CREATE TYPE public.greek_council AS ENUM ('IFC', 'NIC', 'NPC', 'NPHC', 'MGC', 'local', 'other');
CREATE TYPE public.greek_chapter_status AS ENUM ('active', 'inactive', 'suspended', 'unknown');

-- greek_orgs (national master list)
CREATE TABLE public.greek_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nickname text,
  letters text,
  org_type public.greek_org_type NOT NULL,
  council public.greek_council NOT NULL,
  national_website text,
  founded_year integer,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX greek_orgs_name_lower_uniq ON public.greek_orgs (lower(name));
CREATE INDEX greek_orgs_council_idx ON public.greek_orgs (council);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.greek_orgs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.greek_orgs TO anon;
GRANT ALL ON public.greek_orgs TO service_role;
ALTER TABLE public.greek_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all greek_orgs" ON public.greek_orgs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all greek_orgs" ON public.greek_orgs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER greek_orgs_set_updated_at
  BEFORE UPDATE ON public.greek_orgs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- campus_greek_chapters (per-campus instance)
CREATE TABLE public.campus_greek_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  greek_org_id uuid REFERENCES public.greek_orgs(id) ON DELETE SET NULL,
  chapter_designation text,
  chapter_url text,
  exec_page_url text,
  status public.greek_chapter_status NOT NULL DEFAULT 'unknown',
  discovery_source text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campus_greek_chapters_uniq
  ON public.campus_greek_chapters (campus_id, COALESCE(greek_org_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(chapter_designation, ''));
CREATE INDEX campus_greek_chapters_campus_active_idx
  ON public.campus_greek_chapters (campus_id) WHERE archived_at IS NULL;
CREATE INDEX campus_greek_chapters_org_idx ON public.campus_greek_chapters (greek_org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_greek_chapters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_greek_chapters TO anon;
GRANT ALL ON public.campus_greek_chapters TO service_role;
ALTER TABLE public.campus_greek_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all campus_greek_chapters" ON public.campus_greek_chapters FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all campus_greek_chapters" ON public.campus_greek_chapters FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER campus_greek_chapters_set_updated_at
  BEFORE UPDATE ON public.campus_greek_chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend lead pipeline tables
ALTER TABLE public.campus_lead_suggestions
  ADD COLUMN chapter_id uuid REFERENCES public.campus_greek_chapters(id) ON DELETE SET NULL,
  ADD COLUMN position text,
  ADD COLUMN term text;
CREATE INDEX campus_lead_suggestions_chapter_idx ON public.campus_lead_suggestions (chapter_id) WHERE chapter_id IS NOT NULL;

ALTER TABLE public.outreach_leads
  ADD COLUMN chapter_id uuid REFERENCES public.campus_greek_chapters(id) ON DELETE SET NULL,
  ADD COLUMN position text,
  ADD COLUMN term text;
CREATE INDEX outreach_leads_chapter_idx ON public.outreach_leads (chapter_id) WHERE chapter_id IS NOT NULL;

-- Seed national orgs
-- NPC (26 sororities)
INSERT INTO public.greek_orgs (name, nickname, org_type, council, national_website) VALUES
  ('Alpha Chi Omega', 'AXO', 'sorority', 'NPC', 'https://www.alphachiomega.org'),
  ('Alpha Delta Pi', 'ADPi', 'sorority', 'NPC', 'https://www.alphadeltapi.org'),
  ('Alpha Epsilon Phi', 'AEPhi', 'sorority', 'NPC', 'https://www.aephi.org'),
  ('Alpha Gamma Delta', 'AGD', 'sorority', 'NPC', 'https://www.alphagammadelta.org'),
  ('Alpha Omicron Pi', 'AOII', 'sorority', 'NPC', 'https://www.alphaomicronpi.org'),
  ('Alpha Phi', 'APhi', 'sorority', 'NPC', 'https://www.alphaphi.org'),
  ('Alpha Sigma Alpha', 'ASA', 'sorority', 'NPC', 'https://www.alphasigmaalpha.org'),
  ('Alpha Sigma Tau', 'AST', 'sorority', 'NPC', 'https://www.alphasigmatau.org'),
  ('Alpha Xi Delta', 'AXiD', 'sorority', 'NPC', 'https://www.alphaxidelta.org'),
  ('Chi Omega', 'Chi O', 'sorority', 'NPC', 'https://chiomega.com'),
  ('Delta Delta Delta', 'Tri Delta', 'sorority', 'NPC', 'https://www.tridelta.org'),
  ('Delta Gamma', 'DG', 'sorority', 'NPC', 'https://www.deltagamma.org'),
  ('Delta Phi Epsilon', 'DPhiE', 'sorority', 'NPC', 'https://www.dphie.org'),
  ('Delta Zeta', 'DZ', 'sorority', 'NPC', 'https://www.deltazeta.org'),
  ('Gamma Phi Beta', 'GPhi', 'sorority', 'NPC', 'https://www.gammaphibeta.org'),
  ('Kappa Alpha Theta', 'Theta', 'sorority', 'NPC', 'https://www.kappaalphatheta.org'),
  ('Kappa Delta', 'KD', 'sorority', 'NPC', 'https://www.kappadelta.org'),
  ('Kappa Kappa Gamma', 'Kappa', 'sorority', 'NPC', 'https://www.kappakappagamma.org'),
  ('Phi Mu', 'Phi Mu', 'sorority', 'NPC', 'https://www.phimu.org'),
  ('Phi Sigma Sigma', 'PhiSig', 'sorority', 'NPC', 'https://www.phisigmasigma.org'),
  ('Pi Beta Phi', 'Pi Phi', 'sorority', 'NPC', 'https://www.pibetaphi.org'),
  ('Sigma Delta Tau', 'SDT', 'sorority', 'NPC', 'https://www.sigmadeltatau.org'),
  ('Sigma Kappa', 'Sig Kap', 'sorority', 'NPC', 'https://www.sigmakappa.org'),
  ('Sigma Sigma Sigma', 'Tri Sigma', 'sorority', 'NPC', 'https://www.trisigma.org'),
  ('Theta Phi Alpha', 'TPA', 'sorority', 'NPC', 'https://www.thetaphialpha.org'),
  ('Zeta Tau Alpha', 'ZTA', 'sorority', 'NPC', 'https://www.zetataualpha.org');

-- NIC (mainstream fraternities)
INSERT INTO public.greek_orgs (name, nickname, org_type, council, national_website) VALUES
  ('Acacia', 'Acacia', 'fraternity', 'NIC', 'https://acacia.org'),
  ('Alpha Delta Phi', 'ADPhi', 'fraternity', 'NIC', 'https://alphadeltaphi.org'),
  ('Alpha Epsilon Pi', 'AEPi', 'fraternity', 'NIC', 'https://www.aepi.org'),
  ('Alpha Gamma Rho', 'AGR', 'fraternity', 'NIC', 'https://alphagammarho.org'),
  ('Alpha Gamma Sigma', 'AGS', 'fraternity', 'NIC', 'https://alphagammasigma.org'),
  ('Alpha Kappa Lambda', 'AKL', 'fraternity', 'NIC', 'https://alphakappalambda.org'),
  ('Alpha Sigma Phi', 'Alpha Sig', 'fraternity', 'NIC', 'https://alphasigmaphi.org'),
  ('Alpha Tau Omega', 'ATO', 'fraternity', 'NIC', 'https://ato.org'),
  ('Beta Sigma Psi', 'BSP', 'fraternity', 'NIC', 'https://betasigmapsi.org'),
  ('Beta Theta Pi', 'Beta', 'fraternity', 'NIC', 'https://beta.org'),
  ('Chi Phi', 'Chi Phi', 'fraternity', 'NIC', 'https://chiphi.org'),
  ('Chi Psi', 'Chi Psi', 'fraternity', 'NIC', 'https://chipsi.org'),
  ('Delta Chi', 'DChi', 'fraternity', 'NIC', 'https://deltachi.org'),
  ('Delta Kappa Epsilon', 'DKE', 'fraternity', 'NIC', 'https://dke.org'),
  ('Delta Lambda Phi', 'DLP', 'fraternity', 'NIC', 'https://dlp.org'),
  ('Delta Phi', 'Delta Phi', 'fraternity', 'NIC', 'https://www.delta-phi.org'),
  ('Delta Sigma Phi', 'Delta Sig', 'fraternity', 'NIC', 'https://deltasig.org'),
  ('Delta Tau Delta', 'Delt', 'fraternity', 'NIC', 'https://delts.org'),
  ('Delta Upsilon', 'DU', 'fraternity', 'NIC', 'https://deltau.org'),
  ('FarmHouse', 'FarmHouse', 'fraternity', 'NIC', 'https://farmhouse.org'),
  ('Kappa Alpha Order', 'KA', 'fraternity', 'NIC', 'https://www.kappaalphaorder.org'),
  ('Kappa Delta Rho', 'KDR', 'fraternity', 'NIC', 'https://kdr.com'),
  ('Kappa Sigma', 'Kappa Sig', 'fraternity', 'NIC', 'https://kappasigma.org'),
  ('Lambda Chi Alpha', 'Lambda Chi', 'fraternity', 'NIC', 'https://lambdachi.org'),
  ('Phi Delta Theta', 'Phi Delt', 'fraternity', 'NIC', 'https://www.phideltatheta.org'),
  ('Phi Gamma Delta', 'FIJI', 'fraternity', 'NIC', 'https://phigam.org'),
  ('Phi Kappa Psi', 'Phi Psi', 'fraternity', 'NIC', 'https://phikappapsi.com'),
  ('Phi Kappa Sigma', 'Skulls', 'fraternity', 'NIC', 'https://phikappasigma.com'),
  ('Phi Kappa Tau', 'Phi Tau', 'fraternity', 'NIC', 'https://phikappatau.org'),
  ('Phi Kappa Theta', 'Phi Kap', 'fraternity', 'NIC', 'https://phikaps.org'),
  ('Phi Mu Delta', 'PMD', 'fraternity', 'NIC', 'https://phimudelta.org'),
  ('Phi Sigma Kappa', 'PhiSig', 'fraternity', 'NIC', 'https://phisigmakappa.org'),
  ('Pi Kappa Alpha', 'Pike', 'fraternity', 'NIC', 'https://pikes.org'),
  ('Pi Kappa Phi', 'Pi Kapp', 'fraternity', 'NIC', 'https://pikapp.org'),
  ('Pi Lambda Phi', 'Pi Lam', 'fraternity', 'NIC', 'https://pilambdaphi.org'),
  ('Psi Upsilon', 'Psi U', 'fraternity', 'NIC', 'https://psiupsilon.org'),
  ('Sigma Alpha Epsilon', 'SAE', 'fraternity', 'NIC', 'https://sae.net'),
  ('Sigma Alpha Mu', 'Sammy', 'fraternity', 'NIC', 'https://sam.org'),
  ('Sigma Chi', 'Sigma Chi', 'fraternity', 'NIC', 'https://sigmachi.org'),
  ('Sigma Nu', 'Sigma Nu', 'fraternity', 'NIC', 'https://sigmanu.org'),
  ('Sigma Phi Delta', 'SPD', 'fraternity', 'NIC', 'https://sigmaphidelta.org'),
  ('Sigma Phi Epsilon', 'SigEp', 'fraternity', 'NIC', 'https://sigep.org'),
  ('Sigma Pi', 'Sigma Pi', 'fraternity', 'NIC', 'https://sigmapi.org'),
  ('Sigma Tau Gamma', 'Sig Tau', 'fraternity', 'NIC', 'https://sigtau.org'),
  ('Tau Delta Phi', 'TDP', 'fraternity', 'NIC', 'https://taudeltaphi.org'),
  ('Tau Epsilon Phi', 'TEP', 'fraternity', 'NIC', 'https://tep.org'),
  ('Tau Kappa Epsilon', 'TKE', 'fraternity', 'NIC', 'https://tke.org'),
  ('Theta Chi', 'Theta Chi', 'fraternity', 'NIC', 'https://thetachi.org'),
  ('Theta Delta Chi', 'TDX', 'fraternity', 'NIC', 'https://tdx.org'),
  ('Theta Xi', 'Theta Xi', 'fraternity', 'NIC', 'https://thetaxi.org'),
  ('Triangle', 'Triangle', 'fraternity', 'NIC', 'https://triangle.org'),
  ('Zeta Beta Tau', 'ZBT', 'fraternity', 'NIC', 'https://zbt.org'),
  ('Zeta Psi', 'Zete', 'fraternity', 'NIC', 'https://zetapsi.org');

-- NPHC (Divine 9)
INSERT INTO public.greek_orgs (name, nickname, org_type, council, national_website) VALUES
  ('Alpha Phi Alpha', 'Alphas', 'fraternity', 'NPHC', 'https://apa1906.net'),
  ('Kappa Alpha Psi', 'Kappas', 'fraternity', 'NPHC', 'https://kappaalphapsi1911.com'),
  ('Omega Psi Phi', 'Ques', 'fraternity', 'NPHC', 'https://oppf.org'),
  ('Phi Beta Sigma', 'Sigmas', 'fraternity', 'NPHC', 'https://phibetasigma1914.org'),
  ('Iota Phi Theta', 'Iotas', 'fraternity', 'NPHC', 'https://iotaphitheta.org'),
  ('Alpha Kappa Alpha', 'AKA', 'sorority', 'NPHC', 'https://aka1908.com'),
  ('Delta Sigma Theta', 'Deltas', 'sorority', 'NPHC', 'https://deltasigmatheta.org'),
  ('Zeta Phi Beta', 'Zetas', 'sorority', 'NPHC', 'https://zphib1920.org'),
  ('Sigma Gamma Rho', 'SGRho', 'sorority', 'NPHC', 'https://sgrho1922.org');

-- MGC (multicultural)
INSERT INTO public.greek_orgs (name, nickname, org_type, council, national_website) VALUES
  ('Lambda Theta Phi', 'LTP', 'fraternity', 'MGC', 'https://lambda1975.org'),
  ('Sigma Lambda Beta', 'SLB', 'fraternity', 'MGC', 'https://sigmalambdabeta.com'),
  ('Phi Iota Alpha', 'PhiOtas', 'fraternity', 'MGC', 'https://phiota.org'),
  ('Lambda Upsilon Lambda', 'La Unidad Latina', 'fraternity', 'MGC', 'https://launidadlatina.org'),
  ('Sigma Beta Rho', 'SigRho', 'fraternity', 'MGC', 'https://sigrho.org'),
  ('Pi Delta Psi', 'PDPsi', 'fraternity', 'MGC', 'https://pideltapsi.com'),
  ('Lambda Phi Epsilon', 'LFE', 'fraternity', 'MGC', 'https://lambdaphiepsilon.com'),
  ('Beta Chi Theta', 'BXT', 'fraternity', 'MGC', 'https://betachitheta.org'),
  ('Iota Nu Delta', 'IND', 'fraternity', 'MGC', 'https://iotanudelta.org'),
  ('Lambda Theta Alpha', 'LTA', 'sorority', 'MGC', 'https://lambdalady.org'),
  ('Sigma Lambda Gamma', 'SLG', 'sorority', 'MGC', 'https://sigmalambdagamma.com'),
  ('Kappa Delta Chi', 'KDChi', 'sorority', 'MGC', 'https://kappadeltachi.org'),
  ('Hermandad de Sigma Iota Alpha', 'SIA', 'sorority', 'MGC', 'https://hermandad-sia.org'),
  ('Mu Sigma Upsilon', 'MSU', 'sorority', 'MGC', 'https://musigmaupsilon.org'),
  ('Sigma Psi Zeta', 'SYZ', 'sorority', 'MGC', 'https://sigmapsizeta.org'),
  ('Delta Phi Omega', 'DPhiO', 'sorority', 'MGC', 'https://deltaphiomega.org'),
  ('Kappa Phi Lambda', 'KPL', 'sorority', 'MGC', 'https://kappaphilambda.org');
