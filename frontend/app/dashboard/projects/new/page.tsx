// frontend/app/dashboard/projects/new/page.tsx
// New project creation wizard with file upload to Azure Blob Storage

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, Home, Check, Info, X, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Questionnaire from '@/components/Questionnaire';
import api from '@/lib/api';

type Step = 'details' | 'upload' | 'questionnaire';

// Australian states
const AUSTRALIAN_STATES = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NT', label: 'Northern Territory' },
];

// Council lookup by state and postcode prefix
const COUNCIL_LOOKUP: Record<string, Record<string, string>> = {
  NSW: {
    '2000': 'City of Sydney',
    '2001': 'City of Sydney',
    '2010': 'City of Sydney',
    '2011': 'City of Sydney',
    '2015': 'City of Sydney',
    '2016': 'City of Sydney',
    '2017': 'City of Sydney',
    '2018': 'Inner West Council',
    '2019': 'Bayside Council',
    '2020': 'Bayside Council',
    '2021': 'Waverley Council',
    '2022': 'Waverley Council',
    '2023': 'Woollahra Council',
    '2024': 'Woollahra Council',
    '2025': 'Woollahra Council',
    '2026': 'Waverley Council',
    '2027': 'Woollahra Council',
    '2028': 'Woollahra Council',
    '2029': 'Woollahra Council',
    '2030': 'Woollahra Council',
    '2031': 'Randwick City Council',
    '2032': 'Randwick City Council',
    '2033': 'Randwick City Council',
    '2034': 'Randwick City Council',
    '2035': 'Randwick City Council',
    '2036': 'Randwick City Council',
    '2037': 'Inner West Council',
    '2038': 'Inner West Council',
    '2039': 'Inner West Council',
    '2040': 'Inner West Council',
    '2041': 'Inner West Council',
    '2042': 'Inner West Council',
    '2043': 'Inner West Council',
    '2044': 'Inner West Council',
    '2045': 'Inner West Council',
    '2046': 'City of Canada Bay',
    '2047': 'City of Canada Bay',
    '2048': 'Inner West Council',
    '2049': 'Inner West Council',
    '2050': 'Inner West Council',
    '2060': 'North Sydney Council',
    '2061': 'North Sydney Council',
    '2062': 'North Sydney Council',
    '2063': 'North Sydney Council',
    '2064': 'Willoughby City Council',
    '2065': 'Lane Cove Council',
    '2066': 'Lane Cove Council',
    '2067': 'Willoughby City Council',
    '2068': 'Willoughby City Council',
    '2069': 'Ku-ring-gai Council',
    '2070': 'Ku-ring-gai Council',
    '2071': 'Ku-ring-gai Council',
    '2072': 'Ku-ring-gai Council',
    '2073': 'Ku-ring-gai Council',
    '2074': 'Ku-ring-gai Council',
    '2075': 'Ku-ring-gai Council',
    '2076': 'Ku-ring-gai Council',
    '2077': 'Hornsby Shire Council',
    '2078': 'Hornsby Shire Council',
    '2079': 'Hornsby Shire Council',
    '2080': 'Hornsby Shire Council',
    '2081': 'Hornsby Shire Council',
    '2082': 'Hornsby Shire Council',
    '2083': 'Hornsby Shire Council',
    '2084': 'Northern Beaches Council',
    '2085': 'Northern Beaches Council',
    '2086': 'Northern Beaches Council',
    '2087': 'Northern Beaches Council',
    '2088': 'Mosman Council',
    '2089': 'North Sydney Council',
    '2090': 'Mosman Council',
    '2092': 'Northern Beaches Council',
    '2093': 'Northern Beaches Council',
    '2094': 'Northern Beaches Council',
    '2095': 'Northern Beaches Council',
    '2096': 'Northern Beaches Council',
    '2097': 'Northern Beaches Council',
    '2099': 'Northern Beaches Council',
    '2100': 'Northern Beaches Council',
    '2101': 'Northern Beaches Council',
    '2102': 'Northern Beaches Council',
    '2103': 'Northern Beaches Council',
    '2104': 'Northern Beaches Council',
    '2105': 'Northern Beaches Council',
    '2106': 'Northern Beaches Council',
    '2107': 'Northern Beaches Council',
    '2108': 'Northern Beaches Council',
    '2110': 'City of Ryde',
    '2111': 'City of Ryde',
    '2112': 'City of Ryde',
    '2113': 'City of Ryde',
    '2114': 'City of Ryde',
    '2115': 'City of Ryde',
    '2116': 'City of Ryde',
    '2117': 'City of Parramatta',
    '2118': 'City of Parramatta',
    '2119': 'City of Parramatta',
    '2120': 'Hornsby Shire Council',
    '2121': 'City of Parramatta',
    '2122': 'City of Parramatta',
    '2125': 'The Hills Shire Council',
    '2126': 'Hornsby Shire Council',
    '2127': 'City of Parramatta',
    '2128': 'City of Canada Bay',
    '2129': 'City of Canada Bay',
    '2130': 'Inner West Council',
    '2131': 'Inner West Council',
    '2132': 'Inner West Council',
    '2133': 'Inner West Council',
    '2134': 'Burwood Council',
    '2135': 'Strathfield Council',
    '2136': 'Strathfield Council',
    '2137': 'City of Canada Bay',
    '2138': 'City of Canada Bay',
    '2140': 'City of Parramatta',
    '2141': 'Cumberland Council',
    '2142': 'Cumberland Council',
    '2143': 'Cumberland Council',
    '2144': 'Cumberland Council',
    '2145': 'Cumberland Council',
    '2146': 'City of Parramatta',
    '2147': 'Blacktown City Council',
    '2148': 'Blacktown City Council',
    '2150': 'City of Parramatta',
    '2151': 'City of Parramatta',
    '2152': 'City of Parramatta',
    '2153': 'The Hills Shire Council',
    '2154': 'The Hills Shire Council',
    '2155': 'The Hills Shire Council',
    '2156': 'The Hills Shire Council',
    '2157': 'The Hills Shire Council',
    '2158': 'The Hills Shire Council',
    '2159': 'The Hills Shire Council',
    '2160': 'Cumberland Council',
    '2161': 'Cumberland Council',
    '2162': 'Cumberland Council',
    '2163': 'Canterbury-Bankstown Council',
    '2164': 'Fairfield City Council',
    '2165': 'Fairfield City Council',
    '2166': 'Fairfield City Council',
    '2167': 'Fairfield City Council',
    '2168': 'Liverpool City Council',
    '2170': 'Liverpool City Council',
    '2171': 'Liverpool City Council',
    '2172': 'Liverpool City Council',
    '2173': 'Liverpool City Council',
    '2174': 'Liverpool City Council',
    '2175': 'Liverpool City Council',
    '2176': 'Fairfield City Council',
    '2177': 'Fairfield City Council',
    '2178': 'Fairfield City Council',
    '2179': 'Liverpool City Council',
    '2190': 'Canterbury-Bankstown Council',
    '2191': 'Canterbury-Bankstown Council',
    '2192': 'Canterbury-Bankstown Council',
    '2193': 'Canterbury-Bankstown Council',
    '2194': 'Canterbury-Bankstown Council',
    '2195': 'Canterbury-Bankstown Council',
    '2196': 'Canterbury-Bankstown Council',
    '2197': 'Canterbury-Bankstown Council',
    '2198': 'Canterbury-Bankstown Council',
    '2199': 'Canterbury-Bankstown Council',
    '2200': 'Canterbury-Bankstown Council',
    '2750': 'Penrith City Council',
    '2760': 'Blacktown City Council',
    '2761': 'Blacktown City Council',
    '2762': 'Blacktown City Council',
    '2763': 'Blacktown City Council',
    '2765': 'The Hills Shire Council',
    '2766': 'Blacktown City Council',
    '2767': 'Blacktown City Council',
    '2768': 'Blacktown City Council',
    '2769': 'Blacktown City Council',
    '2770': 'Blacktown City Council',
  },
  VIC: {
    '3000': 'City of Melbourne',
    '3001': 'City of Melbourne',
    '3002': 'City of Melbourne',
    '3003': 'City of Melbourne',
    '3004': 'City of Melbourne',
    '3006': 'City of Melbourne',
    '3008': 'City of Melbourne',
    '3121': 'City of Yarra',
    '3122': 'City of Boroondara',
    '3141': 'City of Stonnington',
    '3142': 'City of Stonnington',
    '3143': 'City of Stonnington',
    '3144': 'City of Stonnington',
    '3145': 'City of Stonnington',
    '3181': 'City of Port Phillip',
    '3182': 'City of Port Phillip',
    '3183': 'City of Port Phillip',
    '3184': 'City of Port Phillip',
    '3185': 'City of Glen Eira',
    '3186': 'City of Bayside',
    '3187': 'City of Bayside',
    '3188': 'City of Bayside',
    '3189': 'City of Kingston',
    '3190': 'City of Kingston',
  },
  QLD: {
    '4000': 'Brisbane City Council',
    '4001': 'Brisbane City Council',
    '4002': 'Brisbane City Council',
    '4005': 'Brisbane City Council',
    '4006': 'Brisbane City Council',
    '4007': 'Brisbane City Council',
    '4008': 'Brisbane City Council',
    '4009': 'Brisbane City Council',
    '4010': 'Brisbane City Council',
    '4011': 'Brisbane City Council',
    '4012': 'Brisbane City Council',
    '4013': 'Brisbane City Council',
    '4014': 'Brisbane City Council',
    '4017': 'Brisbane City Council',
    '4018': 'Brisbane City Council',
    '4019': 'Moreton Bay Regional Council',
    '4020': 'Moreton Bay Regional Council',
    '4021': 'Moreton Bay Regional Council',
    '4022': 'Brisbane City Council',
    '4030': 'Brisbane City Council',
    '4031': 'Brisbane City Council',
    '4032': 'Brisbane City Council',
    '4034': 'Brisbane City Council',
    '4051': 'Brisbane City Council',
    '4053': 'Brisbane City Council',
    '4054': 'Brisbane City Council',
    '4059': 'Brisbane City Council',
    '4060': 'Brisbane City Council',
    '4061': 'Brisbane City Council',
    '4064': 'Brisbane City Council',
    '4065': 'Brisbane City Council',
    '4066': 'Brisbane City Council',
    '4067': 'Brisbane City Council',
    '4068': 'Brisbane City Council',
    '4069': 'Brisbane City Council',
    '4101': 'Brisbane City Council',
    '4102': 'Brisbane City Council',
    '4103': 'Brisbane City Council',
    '4104': 'Brisbane City Council',
    '4105': 'Brisbane City Council',
    '4106': 'Brisbane City Council',
    '4107': 'Brisbane City Council',
    '4108': 'Brisbane City Council',
    '4109': 'Brisbane City Council',
    '4110': 'Brisbane City Council',
    '4111': 'Brisbane City Council',
    '4112': 'Brisbane City Council',
    '4113': 'Brisbane City Council',
    '4114': 'City of Logan',
    '4115': 'City of Logan',
    '4116': 'City of Logan',
    '4117': 'City of Logan',
    '4118': 'City of Logan',
    '4119': 'City of Logan',
    '4120': 'Brisbane City Council',
    '4121': 'Brisbane City Council',
    '4122': 'Brisbane City Council',
    '4123': 'City of Logan',
    '4124': 'City of Logan',
    '4125': 'City of Logan',
    '4127': 'City of Logan',
    '4128': 'City of Logan',
    '4129': 'City of Logan',
    '4130': 'City of Logan',
    '4131': 'City of Logan',
    '4132': 'City of Logan',
    '4133': 'City of Logan',
    '4207': 'City of Gold Coast',
    '4208': 'City of Gold Coast',
    '4209': 'City of Gold Coast',
    '4210': 'City of Gold Coast',
    '4211': 'City of Gold Coast',
    '4212': 'City of Gold Coast',
    '4213': 'City of Gold Coast',
    '4214': 'City of Gold Coast',
    '4215': 'City of Gold Coast',
    '4216': 'City of Gold Coast',
    '4217': 'City of Gold Coast',
    '4218': 'City of Gold Coast',
    '4219': 'City of Gold Coast',
    '4220': 'City of Gold Coast',
    '4221': 'City of Gold Coast',
    '4222': 'City of Gold Coast',
    '4223': 'City of Gold Coast',
    '4224': 'City of Gold Coast',
    '4225': 'City of Gold Coast',
    '4226': 'City of Gold Coast',
    '4227': 'City of Gold Coast',
    '4228': 'City of Gold Coast',
    '4229': 'City of Gold Coast',
    '4230': 'City of Gold Coast',
  },
  SA: {
    '5000': 'City of Adelaide',
    '5001': 'City of Adelaide',
    '5005': 'City of Adelaide',
    '5006': 'City of Adelaide',
    '5007': 'City of Adelaide',
    '5008': 'City of Prospect',
    '5009': 'City of Charles Sturt',
    '5010': 'City of Charles Sturt',
    '5011': 'City of Charles Sturt',
    '5012': 'City of Charles Sturt',
    '5013': 'City of Port Adelaide Enfield',
    '5014': 'City of Port Adelaide Enfield',
    '5015': 'City of Port Adelaide Enfield',
    '5016': 'City of Port Adelaide Enfield',
    '5017': 'City of Port Adelaide Enfield',
    '5018': 'City of Port Adelaide Enfield',
    '5019': 'City of Port Adelaide Enfield',
    '5020': 'City of Charles Sturt',
    '5021': 'City of Charles Sturt',
    '5022': 'City of Charles Sturt',
    '5023': 'City of Charles Sturt',
    '5024': 'City of Charles Sturt',
    '5025': 'City of Charles Sturt',
  },
  WA: {
    '6000': 'City of Perth',
    '6001': 'City of Perth',
    '6003': 'City of Perth',
    '6004': 'City of Perth',
    '6005': 'City of Perth',
    '6006': 'City of Perth',
    '6007': 'City of Perth',
    '6008': 'City of Subiaco',
    '6009': 'City of Nedlands',
    '6010': 'Town of Claremont',
    '6011': 'Town of Cottesloe',
    '6012': 'Town of Mosman Park',
    '6014': 'City of Nedlands',
    '6015': 'Town of Cambridge',
    '6016': 'Town of Cambridge',
    '6017': 'City of Stirling',
    '6018': 'City of Stirling',
    '6019': 'City of Stirling',
    '6020': 'City of Stirling',
    '6021': 'City of Stirling',
    '6022': 'City of Stirling',
    '6023': 'City of Joondalup',
    '6024': 'City of Joondalup',
    '6025': 'City of Joondalup',
    '6026': 'City of Joondalup',
    '6027': 'City of Joondalup',
    '6028': 'City of Joondalup',
    '6029': 'City of Stirling',
    '6030': 'City of Wanneroo',
    '6031': 'City of Wanneroo',
    '6032': 'City of Wanneroo',
    '6033': 'City of Wanneroo',
    '6034': 'City of Wanneroo',
    '6035': 'City of Wanneroo',
    '6036': 'City of Wanneroo',
    '6037': 'City of Wanneroo',
    '6038': 'City of Wanneroo',
    '6050': 'City of Vincent',
    '6051': 'City of Vincent',
    '6052': 'City of Vincent',
    '6053': 'City of Bayswater',
    '6054': 'City of Bayswater',
    '6055': 'City of Swan',
    '6056': 'City of Swan',
    '6057': 'City of Swan',
    '6058': 'City of Swan',
    '6059': 'City of Stirling',
    '6060': 'City of Stirling',
    '6061': 'City of Stirling',
    '6062': 'City of Stirling',
    '6063': 'City of Bayswater',
    '6064': 'City of Wanneroo',
    '6065': 'City of Wanneroo',
    '6066': 'City of Swan',
    '6067': 'City of Swan',
    '6068': 'City of Swan',
    '6069': 'City of Swan',
    '6070': 'Shire of Mundaring',
    '6071': 'Shire of Mundaring',
    '6072': 'Shire of Mundaring',
    '6073': 'Shire of Mundaring',
    '6074': 'Shire of Kalamunda',
    '6076': 'Shire of Kalamunda',
    '6077': 'City of Swan',
    '6078': 'City of Swan',
    '6079': 'City of Swan',
    '6081': 'Shire of Mundaring',
    '6082': 'Shire of Mundaring',
    '6083': 'Shire of Chittering',
    '6084': 'Shire of Chittering',
    '6090': 'City of Wanneroo',
    '6100': 'City of Victoria Park',
    '6101': 'Town of Victoria Park',
    '6102': 'Town of Victoria Park',
    '6103': 'Town of Victoria Park',
    '6104': 'City of Belmont',
    '6105': 'City of Belmont',
    '6106': 'City of Belmont',
    '6107': 'City of Belmont',
    '6108': 'City of Gosnells',
    '6109': 'City of Gosnells',
    '6110': 'City of Gosnells',
    '6111': 'City of Gosnells',
    '6112': 'City of Armadale',
    '6147': 'City of Canning',
    '6148': 'City of Canning',
    '6149': 'City of Melville',
    '6150': 'City of Melville',
    '6151': 'City of South Perth',
    '6152': 'City of South Perth',
    '6153': 'City of Melville',
    '6154': 'City of Melville',
    '6155': 'City of Canning',
    '6156': 'City of Melville',
    '6157': 'City of Melville',
    '6158': 'City of Fremantle',
    '6159': 'City of Fremantle',
    '6160': 'City of Fremantle',
    '6161': 'City of Fremantle',
    '6162': 'City of Fremantle',
    '6163': 'City of Cockburn',
    '6164': 'City of Cockburn',
    '6165': 'City of Cockburn',
    '6166': 'City of Cockburn',
    '6167': 'City of Cockburn',
    '6168': 'City of Rockingham',
    '6169': 'City of Rockingham',
    '6170': 'City of Rockingham',
    '6171': 'City of Rockingham',
    '6172': 'City of Rockingham',
  },
  TAS: {
    '7000': 'City of Hobart',
    '7001': 'City of Hobart',
    '7004': 'City of Hobart',
    '7005': 'City of Hobart',
    '7007': 'City of Hobart',
    '7008': 'City of Glenorchy',
    '7009': 'City of Glenorchy',
    '7010': 'City of Glenorchy',
    '7011': 'City of Glenorchy',
    '7012': 'City of Glenorchy',
    '7015': 'City of Clarence',
    '7016': 'City of Clarence',
    '7017': 'City of Clarence',
    '7018': 'City of Clarence',
    '7019': 'City of Clarence',
    '7020': 'City of Clarence',
    '7021': 'City of Clarence',
    '7050': 'Kingborough Council',
    '7051': 'Kingborough Council',
    '7052': 'Kingborough Council',
    '7053': 'Kingborough Council',
    '7054': 'Kingborough Council',
    '7055': 'Kingborough Council',
    '7250': 'City of Launceston',
    '7248': 'City of Launceston',
    '7249': 'City of Launceston',
  },
  ACT: {
    '2600': 'ACT Government',
    '2601': 'ACT Government',
    '2602': 'ACT Government',
    '2603': 'ACT Government',
    '2604': 'ACT Government',
    '2605': 'ACT Government',
    '2606': 'ACT Government',
    '2607': 'ACT Government',
    '2608': 'ACT Government',
    '2609': 'ACT Government',
    '2610': 'ACT Government',
    '2611': 'ACT Government',
    '2612': 'ACT Government',
    '2614': 'ACT Government',
    '2615': 'ACT Government',
    '2617': 'ACT Government',
    '2618': 'ACT Government',
    '2900': 'ACT Government',
    '2901': 'ACT Government',
    '2902': 'ACT Government',
    '2903': 'ACT Government',
    '2904': 'ACT Government',
    '2905': 'ACT Government',
    '2906': 'ACT Government',
    '2911': 'ACT Government',
    '2912': 'ACT Government',
    '2913': 'ACT Government',
    '2914': 'ACT Government',
  },
  NT: {
    '0800': 'City of Darwin',
    '0801': 'City of Darwin',
    '0810': 'City of Darwin',
    '0811': 'City of Darwin',
    '0812': 'City of Darwin',
    '0820': 'City of Darwin',
    '0821': 'City of Darwin',
    '0822': 'Litchfield Council',
    '0828': 'City of Palmerston',
    '0829': 'City of Palmerston',
    '0830': 'City of Palmerston',
    '0831': 'City of Palmerston',
    '0832': 'City of Palmerston',
    '0834': 'City of Darwin',
    '0835': 'City of Darwin',
    '0836': 'City of Darwin',
    '0837': 'City of Darwin',
    '0838': 'City of Darwin',
    '0839': 'City of Darwin',
    '0840': 'City of Darwin',
    '0841': 'City of Darwin',
    '0845': 'Litchfield Council',
    '0846': 'Litchfield Council',
    '0847': 'Litchfield Council',
    '0850': 'Alice Springs Town Council',
    '0851': 'Alice Springs Town Council',
    '0852': 'MacDonnell Regional Council',
    '0853': 'MacDonnell Regional Council',
    '0854': 'MacDonnell Regional Council',
    '0860': 'Katherine Town Council',
    '0861': 'Katherine Town Council',
    '0862': 'Victoria Daly Regional Council',
  },
};

// Function to lookup council based on state and postcode
const lookupCouncil = (state: string, postcode: string): string => {
  if (!state || !postcode || postcode.length !== 4) return '';
  const stateCouncils = COUNCIL_LOOKUP[state];
  if (!stateCouncils) return '';
  return stateCouncils[postcode] || '';
};

interface ProjectData {
  name: string;
  lot_dp: string;
  street_address: string;
  state: string;
  postcode: string;
  council: string;
  land_width: string;
  land_depth: string;
  contourFile: File | null;
}

interface QuestionnaireData {
  bedrooms: number;
  bathrooms: number;
  living_areas: number;
  garage_spaces: number;
  storeys: number;
  style: string;
  open_plan: boolean;
  outdoor_entertainment: boolean;
  home_office: boolean;
}

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentStep, setCurrentStep] = useState<Step>('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  
  const [projectData, setProjectData] = useState<ProjectData>({
    name: '',
    lot_dp: '',
    street_address: '',
    state: '',
    postcode: '',
    council: '',
    land_width: '',
    land_depth: '',
    contourFile: null,
  });

  const steps: { id: Step; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'upload', label: 'Files' },
    { id: 'questionnaire', label: 'Requirements' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  // Validate Australian postcode (4 digits)
  const validatePostcode = (postcode: string): boolean => {
    return /^\d{4}$/.test(postcode);
  };

  const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    
    // Lookup council when postcode is complete
    let council = '';
    if (value.length === 4 && projectData.state) {
      council = lookupCouncil(projectData.state, value);
    }
    
    setProjectData(prev => ({ ...prev, postcode: value, council }));
    
    if (value.length === 4) {
      setPostcodeError(null);
    } else if (value.length > 0) {
      setPostcodeError('Postcode must be 4 digits');
    }
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const state = e.target.value;
    
    // Re-lookup council if postcode exists
    let council = '';
    if (state && projectData.postcode.length === 4) {
      council = lookupCouncil(state, projectData.postcode);
    }
    
    setProjectData(prev => ({ ...prev, state, council }));
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.dwg', '.dxf'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        setError('Please upload a PDF, PNG, JPG, DWG, or DXF file');
        return;
      }
      
      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }
      
      setProjectData(prev => ({ ...prev, contourFile: file }));
      setError(null);
    }
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setProjectData(prev => ({ ...prev, contourFile: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const goToNextStep = () => {
    if (currentStep === 'details') {
      if (!projectData.state) {
        setError('Please select a state');
        return;
      }
      if (!validatePostcode(projectData.postcode)) {
        setPostcodeError('Please enter a valid 4-digit Australian postcode');
        return;
      }
    }
    
    setError(null);
    setPostcodeError(null);
    
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const goToPrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const isStep1Valid = () => {
    return (
      projectData.name.trim().length > 0 &&
      projectData.state.length > 0 &&
      validatePostcode(projectData.postcode) &&
      parseFloat(projectData.land_width) > 0 &&
      parseFloat(projectData.land_depth) > 0
    );
  };

  const handleQuestionnaireComplete = async (questionnaireData: QuestionnaireData) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const landWidth = parseFloat(projectData.land_width);
      const landDepth = parseFloat(projectData.land_depth);
      
      // First, upload contour file if exists
      let contourPlanUrl: string | undefined;
      
      if (projectData.contourFile && user) {
        try {
          // Upload file to Azure Blob Storage
          contourPlanUrl = await api.uploadContourFile(
            projectData.contourFile,
            user?.name || user?.email || 'unknown',
            projectData.name
          );
        } catch (uploadErr) {
          console.error('Error uploading contour file:', uploadErr);
          // Continue without file - don't fail the whole project creation
        }
      }
      
      // Create project with all data
      const project = await api.createProject({
        name: projectData.name,
        
        // Location details
        lot_dp: projectData.lot_dp || undefined,
        street_address: projectData.street_address || undefined,
        state: projectData.state,
        postcode: projectData.postcode,
        council: projectData.council || undefined,
        
        // Land details
        land_width: landWidth,
        land_depth: landDepth,
        land_area: landWidth * landDepth,
        
        // Contour plan URL (if uploaded)
        contour_plan_url: contourPlanUrl,
        
        // Building requirements
        bedrooms: questionnaireData.bedrooms,
        bathrooms: questionnaireData.bathrooms,
        living_areas: questionnaireData.living_areas,
        garage_spaces: questionnaireData.garage_spaces,
        storeys: questionnaireData.storeys,
        
        // Style preferences
        style: questionnaireData.style,
        open_plan: questionnaireData.open_plan,
        outdoor_entertainment: questionnaireData.outdoor_entertainment,
        home_office: questionnaireData.home_office,
      });
      
      console.log('Project created:', project);
      router.push(`/dashboard/projects?success=created&id=${project.id}`);
      
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
      setIsSubmitting(false);
    }
  };

  const projectDetailsForReview = {
    name: projectData.name,
    land_width: parseFloat(projectData.land_width) || 0,
    land_depth: parseFloat(projectData.land_depth) || 0,
    lot_dp: projectData.lot_dp || undefined,
    street_address: projectData.street_address || undefined,
    state: projectData.state,
    postcode: projectData.postcode,
    council: projectData.council || undefined,
    contourFileName: projectData.contourFile?.name,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={() => router.push('/dashboard/projects')} 
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Projects
        </button>
        <h1 className="text-2xl font-bold text-white">Create New Project</h1>
      </div>

      {/* Step Indicator */}
      <div className="mb-8 flex items-center justify-between max-w-2xl">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition ${
                index <= currentStepIndex 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white/10 text-gray-400'
              }`}
            >
              {index < currentStepIndex ? <Check className="w-5 h-5" /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div className={`w-16 h-1 mx-2 rounded transition ${
                index < currentStepIndex ? 'bg-blue-600' : 'bg-white/10'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-2xl mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="max-w-2xl">
        {/* Step 1: Project Details */}
        {currentStep === 'details' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Home className="w-5 h-5 text-blue-400" /> Project Details
            </h2>
            
            <div className="space-y-5">
              {/* Project Name */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.name} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, name: e.target.value }))} 
                  placeholder="e.g., Smith Family Home" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                />
              </div>

              {/* Lot/DP (Optional) */}
              <div>
                <label className="block text-sm text-gray-300 mb-2 flex items-center gap-1">
                  Lot#/DP <span className="text-gray-500">(Optional)</span>
                  <Info className="w-4 h-4 text-gray-500" />
                </label>
                <input 
                  type="text" 
                  value={projectData.lot_dp} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, lot_dp: e.target.value }))}
                  placeholder="e.g., 1142/DP214682" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Land title reference from your property documents
                </p>
              </div>

              {/* Street Address (Optional) */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Street Address <span className="text-gray-500">(Optional)</span>
                </label>
                <input 
                  type="text" 
                  value={projectData.street_address} 
                  onChange={(e) => setProjectData(prev => ({ ...prev, street_address: e.target.value }))}
                  placeholder="e.g., 123 Main Street, Suburb" 
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* State and Postcode Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* State (Mandatory) */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    State <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={projectData.state}
                    onChange={handleStateChange}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-800">Select State</option>
                    {AUSTRALIAN_STATES.map((state) => (
                      <option key={state.value} value={state.value} className="bg-slate-800">
                        {state.value} - {state.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Postcode (Mandatory) */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Postcode <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={projectData.postcode} 
                    onChange={handlePostcodeChange}
                    placeholder="e.g., 2000" 
                    maxLength={4}
                    className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white placeholder-gray-500 focus:outline-none ${
                      postcodeError ? 'border-red-500' : 'border-white/10 focus:border-blue-500'
                    }`}
                  />
                  {postcodeError && (
                    <p className="text-red-400 text-xs mt-1">{postcodeError}</p>
                  )}
                </div>
              </div>

              {/* Council (Auto-detected) */}
              {projectData.council && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <span className="text-green-400 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Council: <strong>{projectData.council}</strong>
                  </span>
                </div>
              )}
              
              {/* Land Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Land Width (m) <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="number" 
                    value={projectData.land_width} 
                    onChange={(e) => setProjectData(prev => ({ ...prev, land_width: e.target.value }))} 
                    placeholder="15" 
                    min="1"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Land Depth (m) <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="number" 
                    value={projectData.land_depth} 
                    onChange={(e) => setProjectData(prev => ({ ...prev, land_depth: e.target.value }))} 
                    placeholder="30" 
                    min="1"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" 
                  />
                </div>
              </div>

              {/* Land Area Display */}
              {projectData.land_width && projectData.land_depth && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <span className="text-blue-400 text-sm">
                    Total Land Area: <strong>{(parseFloat(projectData.land_width) * parseFloat(projectData.land_depth)).toFixed(0)} m²</strong>
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-6">
              <button 
                onClick={goToNextStep} 
                disabled={!isStep1Valid()} 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: File Upload */}
        {currentStep === 'upload' && (
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" /> Upload Contour Plan (Optional)
            </h2>
            
            <p className="text-gray-400 mb-6">
              Upload a contour plan or survey report to help generate more accurate floor plans.
            </p>
            
            {/* File Upload Area */}
            {!projectData.contourFile ? (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition">
                <Upload className="w-10 h-10 text-gray-400 mb-3" />
                <span className="text-gray-300 text-sm font-medium">Click to upload contour plan</span>
                <span className="text-gray-500 text-xs mt-2">PDF, PNG, JPG, DWG, DXF (max 50MB)</span>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf"
                  onChange={handleFileSelect}
                />
              </label>
            ) : (
              /* Selected File Display */
              <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{projectData.contourFile.name}</p>
                      <p className="text-gray-400 text-xs">
                        {(projectData.contourFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    className="p-2 hover:bg-white/10 rounded-lg transition"
                    title="Remove file"
                  >
                    <X className="w-5 h-5 text-gray-400 hover:text-red-400" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
                  <Check className="w-4 h-4" />
                  File ready to upload
                </div>
              </div>
            )}
            
            <div className="flex justify-between mt-6">
              <button 
                onClick={goToPrevStep} 
                className="bg-white/10 text-white px-6 py-3 rounded-lg hover:bg-white/20 flex items-center gap-2 transition"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button 
                onClick={goToNextStep} 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Questionnaire */}
        {currentStep === 'questionnaire' && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden">
            <Questionnaire 
              onComplete={handleQuestionnaireComplete}
              onCancel={goToPrevStep}
              projectDetails={projectDetailsForReview}
              isSubmitting={isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
}
