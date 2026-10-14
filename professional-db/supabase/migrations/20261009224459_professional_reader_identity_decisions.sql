-- Corpus identity decisions contain professional membership/conflict assertions,
-- not original provider archives. The pinned reader needs them for parity checks.
grant select on docmap_professional.identity_decisions to docmap_professional_reader;
create policy approved_read on docmap_professional.identity_decisions for select
to docmap_professional_reader using (
  (select decision from docmap_professional.publication_events e
   where e.release_id=identity_decisions.release_id
   order by created_at desc,event_id desc limit 1)='approved'
);
