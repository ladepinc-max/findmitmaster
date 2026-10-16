DROP POLICY "enrollments readable" ON public.class_enrollments;

CREATE POLICY "enrollments readable"
ON public.class_enrollments
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.live_classes lc
    WHERE lc.id = class_enrollments.class_id
      AND lc.host_id = auth.uid()
  )
);