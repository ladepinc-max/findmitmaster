INSERT INTO public.app_pricing (key, label, amount) VALUES
 ('graduate_application', 'FindMit Graduate application fee', 350),
 ('company_application', 'FindMit Employer application fee', 3000)
ON CONFLICT (key) DO NOTHING;