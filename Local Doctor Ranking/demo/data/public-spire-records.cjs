// Public-profile demonstration corpus. NOT a Supabase export or a complete directory.
// See DATA-PROVENANCE.md. Do not infer negative insurance status from an empty array.
const origin = 'https://www.spirehealthcare.com';
const hospitals = {
  bushey: { name: 'Spire Bushey Hospital', address: 'Heathbourne Road, Bushey, Hertfordshire', postcode: 'WD23 1RD', city: 'Bushey', latitude: 51.637526, longitude: -0.331566, sourceUrl: `${origin}/spire-bushey-hospital/` },
  harpenden: { name: 'Spire Harpenden Hospital', address: 'Ambrose Lane, Harpenden, Hertfordshire', postcode: 'AL5 4BP', city: 'Harpenden', latitude: 51.82813, longitude: -0.360392, sourceUrl: `${origin}/spire-harpenden-hospital/` },
  east: { name: 'Spire London East Hospital', address: 'Roding Lane South, Redbridge, Essex', postcode: 'IG4 5PZ', city: 'Redbridge', latitude: 51.587154, longitude: 0.043064, sourceUrl: `${origin}/spire-london-east-hospital/` },
};

const rows = [
  {
    id: 'spire-7043233', name: 'Mr Ravi Popat', gmc: '7043233',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Knee replacement', 'Hip replacement', 'Robotic joint surgery', 'Knee ligament reconstruction', 'Meniscus and cartilage surgery', 'Sports injuries'],
    description: 'Hip and knee surgeon whose practice includes sports injury reconstruction, partial knee replacements and treatment of cartilage, meniscus and ligament injuries.',
    sites: ['bushey', 'harpenden'], slug: 'mr-ravi-popat-c7043233',
    portrait: '/media/30717/4839476_hpn_mr-ravi-popat-fa.jpg',
    bupa: { sourceUrl: 'https://www.finder.bupa.co.uk/Consultant/view/311728/mr_ravi_popat', text: 'Bupa Finder lists Ravi Popat as fee assured, with a verified account and Open Referral network participation.' },
  },
  {
    id: 'spire-4201393', name: 'Mr Tim Waters', gmc: '4201393',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Knee replacement', 'Hip replacement', 'Revision joint surgery', 'Robotic joint surgery', 'Knee arthroscopy', 'Arthrosamid injections'],
    description: 'Hip and knee specialist with a focus on complex cases, including problems following previous joint replacements. His Spire profile also lists keyhole surgery and knee pain injections.',
    sites: ['bushey'], slug: 'mr-tim-waters-c4201393',
    portrait: '/media/11851/tim_waters_bushey_consultant.jpg',
    bupa: { sourceUrl: 'https://www.finder.bupa.co.uk/Consultant/view/89653/mr_timothy_waters', text: 'Bupa Finder lists Timothy Waters in its Open Referral network, with a verified account, but explicitly says he is not fee assured. Some fees can exceed cover.' },
  },
  {
    id: 'spire-3585092', name: 'Mr Simon Jennings', gmc: '3585092',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Knee replacement', 'Hip replacement', 'Revision joint surgery', 'Knee arthroscopy', 'Sports injuries', 'Ligament reconstruction', 'Arthrosamid injections'],
    description: 'Knee and hip surgeon treating sports injuries and both primary and revision joint replacement cases. His profile includes partial knee replacement and robotic surgery.',
    sites: ['bushey'], slug: 'mr-simon-jennings-c3585092',
    portrait: '/media/16448/simon_jennings-preferred.jpg',
  },
  {
    id: 'spire-6090006', name: 'Mr Ben Spiegelberg', gmc: '6090006',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Knee replacement', 'Hip replacement', 'Knee arthroscopy', 'Knee ligament surgery', 'Cartilage transplantation', 'Robotic joint surgery', 'Joint pain'],
    description: 'Trauma and orthopaedic surgeon with hip and knee interests including partial knee replacement, cartilage transplantation, hip resurfacing and revision joint replacements.',
    sites: ['bushey'], slug: 'mr-ben-spiegelberg-c6090006',
    portrait: '/media/24864/28127_bus_1233568-mr_ben_spiegelberg_fa.jpg',
  },
  {
    id: 'spire-4209982', name: 'Mr Yegappan Kalairajah', gmc: '4209982',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Knee surgery', 'Hip surgery', 'Sports injuries', 'Ligament reconstruction', 'Meniscal surgery', 'Revision joint surgery'],
    description: 'Orthopaedic surgeon with interests in hip and knee joint replacement, revision surgery and sports surgery of the hip, knee and ankle.',
    sites: ['harpenden'], slug: 'mr-yegappan-kalairajah-c4209982',
    portrait: '/media/12496/yega_kalairajah_harpenden_consultant.jpg',
    bupa: { sourceUrl: 'https://www.finder.bupa.co.uk/Consultant/view/83829/mr_yegappan_kalairajah', text: 'Bupa Finder lists Yegappan Kalairajah as fee assured with a verified account, but not in the Open Referral network.' },
  },
  {
    id: 'spire-4465261', name: 'Mr Tarique Parwez', gmc: '4465261',
    specialty: 'Orthopaedics',
    clinicalInterests: ['ACL reconstruction', 'Knee arthroscopy', 'Partial knee replacement', 'Total knee replacement', 'Hip replacement', 'Sports knee injuries'],
    description: 'Knee and hip arthroplasty and sports knee surgeon with a particular interest in partial knee replacement.',
    sites: ['harpenden'], slug: 'mr-tarique-parwez-c4465261',
    portrait: '/media/28711/3109603-mr-tarique-parwez.jpg',
  },
  {
    id: 'spire-3327618', name: 'Mr Sunil Kumar', gmc: '3327618',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Knee surgery', 'Sports injuries', 'Meniscal surgery', 'Cartilage surgery', 'ACL reconstruction', 'Knee replacement', 'Non-surgical knee treatment'],
    description: 'Knee and sports injury specialist offering surgical and non-surgical care. His profile includes meniscus repair, ligament reconstruction and partial or total knee replacement.',
    sites: ['east'], slug: 'mr-sunil-kumar-c3327618',
    portrait: '/media/31952/6253403-lse-consultant-profile-mr-sunil-kumar_fa.jpg',
    bupa: { sourceUrl: 'https://www.finder.bupa.co.uk/Consultant/view/29307/mr_sunil_kumar', text: 'Bupa Finder identifies Sunil Kumar as a Platinum consultant, fee assured, with a verified account and Open Referral network participation.' },
  },
  {
    id: 'spire-4392905', name: 'Mr Ahmad Ali', gmc: '4392905',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Complex knee surgery', 'Partial knee replacement', 'Ligament repair', 'ACL reconstruction', 'Computer-navigated knee replacement', 'Sports injuries'],
    description: 'Consultant knee surgeon whose Spire practice includes complex knee problems, ligament reconstruction and computer-navigated knee replacement.',
    sites: ['east'], slug: 'mr-ahmad-ali-c4392905',
    portrait: '/media/15650/ahmad_ali_hartswood_consultant.jpg',
  },
  {
    id: 'spire-6108524', name: 'Mr Mohit Bansal', gmc: '6108524',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Knee ligament surgery', 'Knee replacement', 'Hip replacement', 'Sports injuries', 'Arthritis', 'Meniscal repair', 'Joint preservation'],
    description: 'Hip and knee surgeon treating arthritis, sports injuries and trauma. His interests include partial knee replacements and procedures intended to preserve the knee joint.',
    sites: ['east'], slug: 'mr-mohit-bansal-c6108524',
    portrait: '/media/27862/2310023-rod-mr-mohit-bansal_fa.jpg',
  },
  {
    id: 'spire-4076494', name: 'Mr Mandeep Lamba', gmc: '4076494',
    specialty: 'Orthopaedics',
    clinicalInterests: ['Hip replacement', 'Knee replacement', 'Knee arthroscopy', 'Soft tissue reconstruction', 'ACL reconstruction', 'Cartilage repair', 'Sports injuries'],
    description: 'Orthopaedic surgeon treating hip and knee conditions, major trauma and sports injuries. His interests include meniscus repair, ligament reconstruction and revision joint replacement.',
    sites: ['east'], slug: 'mr-mandeep-lamba-c4076494',
    portrait: '/media/21686/13376_loe_1041695-consultant-image-banner-mr-mandeep-lamba.jpg',
  },
  {
    id: 'spire-3476550', name: 'Dr Ameet Bakhai',
    specialty: 'Cardiology',
    clinicalInterests: ['Chest pain', 'Palpitations', 'Breathlessness', 'High blood pressure', 'Heart failure', 'Heart rhythm problems', 'Cardiovascular fitness'],
    description: 'Cardiologist assessing cardiac symptoms including palpitations, breathlessness and chest discomfort, with interests in heart failure, blood pressure and cardiovascular risk.',
    sites: ['bushey'], slug: 'dr-ameet-bakhai-c3476550',
    portrait: '/media/11636/dr-ameet-bakhai-2016.jpg',
  },
  {
    id: 'spire-2651714', name: 'Dr Laurence R Lever', gmc: '2651714',
    specialty: 'Dermatology',
    clinicalInterests: ['Acne', 'Eczema', 'Dermatitis', 'Psoriasis', 'Skin cancer excision', 'Mole removal'],
    description: 'Dermatologist caring for adults and children with skin conditions. His Spire treatments include acne, eczema, psoriasis and removal of malignant skin lesions.',
    sites: ['bushey'], slug: 'dr-laurence-r-lever-c2651714',
    portrait: '/media/11821/lawrence_lever_bushey_consultant.jpg',
  },
];

module.exports = rows.map(({ sites, slug, portrait, bupa, ...record }) => {
  const profileUrl = `${origin}/consultant-profiles/${slug}/`;
  const locations = sites.map(site => ({ ...hospitals[site] }));
  return {
    ...record,
    locations,
    insurers: bupa ? ['Bupa'] : [],
    insuranceEvidence: bupa ? [{ insurer: 'Bupa', ...bupa }] : [],
    profileUrl,
    sourceUrls: [profileUrl, ...locations.map(location => location.sourceUrl), ...(bupa ? [bupa.sourceUrl] : [])],
    affiliationEvidence: {
      sourceUrl: profileUrl,
      text: `Spire's consultant profile lists ${locations.map(location => location.name).join(' and ')} under practising locations.`,
    },
    imageUrl: `${origin}${portrait}`,
    retrievedAt: '2026-10-01',
  };
});
