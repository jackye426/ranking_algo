-- Transaction timestamps can tie. Publication history needs a monotonic
-- append order so a later revocation wins independently of event-ID spelling.
alter table docmap_professional.publication_events add column
  publication_order bigint generated always as identity unique;
grant usage on sequence docmap_professional.publication_events_publication_order_seq
  to docmap_professional_publisher;
create index publication_release_order on docmap_professional.publication_events
  (release_id, publication_order desc);
do $$ declare t text; begin
  foreach t in array array['members','evidence','evidence_sources','derived_artifacts','identity_decisions'] loop
    execute format('alter policy approved_read on docmap_professional.%I using ((select decision from docmap_professional.publication_events e where e.release_id=%I.release_id order by publication_order desc limit 1)=''approved'')',t,t);
  end loop;
end $$;
