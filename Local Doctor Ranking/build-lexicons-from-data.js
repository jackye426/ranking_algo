/**
 * Build pre-fixed lexicons from practitioner JSONs for use in clinical intent v2.
 * Reads: cardiology.json, general-surgery.json, obstetrics-and-gynaecology.json,
 *        ophthalmology.json, trauma-and-orthopaedic-surgery.json
 * Writes: subspecialties-from-data.json, procedures-from-data.json, conditions-from-data.json
 * Re-run when practitioner data is refreshed.
 */

const path = require('path');
const fs = require('fs');

const SPECIALTY_FILES = [
  'cardiology.json',
  'general-surgery.json',
  'obstetrics-and-gynaecology.json',
  'ophthalmology.json',
  'trauma-and-orthopaedic-surgery.json',
];

const OUTPUT_DIR = __dirname;

function loadPractitioners(fileName) {
  const filePath = path.join(OUTPUT_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`[Lexicons] File not found: ${fileName}`);
    return { specialty: path.basename(fileName, '.json'), practitioners: [] };
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    specialty: data.specialty || path.basename(fileName, '.json'),
    practitioners: data.practitioners || [],
  };
}

function extractConditions(clinical_expertise) {
  if (!clinical_expertise || typeof clinical_expertise !== 'string') return [];
  const conditions = [];
  const segments = clinical_expertise.split(';').map((s) => s.trim());
  for (const seg of segments) {
    if (seg.startsWith('Condition:')) {
      const value = seg.replace(/^Condition:\s*/i, '').trim();
      if (value) conditions.push(value);
    }
  }
  return conditions;
}

function extractProceduresFromExpertise(clinical_expertise) {
  if (!clinical_expertise || typeof clinical_expertise !== 'string') return [];
  const procedures = [];
  const segments = clinical_expertise.split(';').map((s) => s.trim());
  for (const seg of segments) {
    if (seg.startsWith('Procedure:')) {
      const value = seg.replace(/^Procedure:\s*/i, '').trim();
      if (value) procedures.push(value);
    }
  }
  return procedures;
}

function main() {
  const allSubspecialties = new Set();
  const subspecialtiesBySpecialty = {};
  const allProcedures = new Set();
  const allConditions = new Set();

  for (const file of SPECIALTY_FILES) {
    const { specialty, practitioners } = loadPractitioners(file);
    const subsInSpecialty = new Set();
    for (const p of practitioners) {
      if (Array.isArray(p.subspecialties)) {
        p.subspecialties.forEach((s) => {
          const name = (s || '').trim();
          if (name) {
            allSubspecialties.add(name);
            subsInSpecialty.add(name);
          }
        });
      }
      if (Array.isArray(p.procedure_groups)) {
        p.procedure_groups.forEach((pg) => {
          const name = (pg && pg.procedure_group_name) ? pg.procedure_group_name.trim() : null;
          if (name) allProcedures.add(name);
        });
      }
      const proceduresFromExpertise = extractProceduresFromExpertise(p.clinical_expertise);
      proceduresFromExpertise.forEach((name) => allProcedures.add(name));
      const conditions = extractConditions(p.clinical_expertise);
      conditions.forEach((name) => allConditions.add(name));
    }
    subspecialtiesBySpecialty[specialty] = [...subsInSpecialty].sort();
  }

  const subspecialtiesPayload = {
    global: [...allSubspecialties].sort(),
    bySpecialty: subspecialtiesBySpecialty,
    builtAt: new Date().toISOString(),
  };
  const proceduresPayload = {
    procedures: [...allProcedures].sort(),
    builtAt: new Date().toISOString(),
  };
  const conditionsPayload = {
    conditions: [...allConditions].sort(),
    builtAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'subspecialties-from-data.json'),
    JSON.stringify(subspecialtiesPayload, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'procedures-from-data.json'),
    JSON.stringify(proceduresPayload, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'conditions-from-data.json'),
    JSON.stringify(conditionsPayload, null, 2),
    'utf8'
  );

  console.log('[Lexicons] subspecialties-from-data.json:', subspecialtiesPayload.global.length, 'global');
  console.log('[Lexicons] procedures-from-data.json:', proceduresPayload.procedures.length);
  console.log('[Lexicons] conditions-from-data.json:', conditionsPayload.conditions.length);
  console.log('[Lexicons] Done.');
}

main();
