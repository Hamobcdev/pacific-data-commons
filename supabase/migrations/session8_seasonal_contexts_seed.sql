-- ============================================================
-- Pacific Data Commons — Session 8 Seasonal Contexts Seed
-- Pacific fisheries and agricultural seasonal data
-- Source: SPC Oceanic Fisheries Programme, FAO Pacific Agricultural
--         Calendar, WCPFC Statistical Bulletin, MAF Samoa
-- All data is publicly available regional knowledge
-- Applied directly to Supabase via MCP: August 3, 2026
-- ============================================================

INSERT INTO seasonal_contexts 
  (geography_scope, domain, season_label, month_start, month_end, context_notes, data_sources, version)
VALUES

('pacific_wide', 'fisheries', 'Skipjack Peak Season', 1, 3,
 'Highest skipjack catch rates in equatorial waters. FAD sets productive. Strong westward migration patterns. WCPFC data shows peak CPUE during January-March period.',
 ARRAY['SPC Oceanic Fisheries Programme', 'WCPFC Statistical Bulletin'], 1),

('pacific_wide', 'fisheries', 'Bigeye Deep Season', 4, 6,
 'Bigeye tuna moving deeper. Night sets and deep FADs more productive. Skipjack volumes moderate. Mixed species composition in equatorial convergence zone.',
 ARRAY['SPC Oceanic Fisheries Programme', 'WCPFC Statistical Bulletin'], 1),

('pacific_wide', 'fisheries', 'Yellowfin Peak Season', 7, 9,
 'Yellowfin surface availability peaks. Mixed species FAD sets productive in equatorial convergence zone. Strong association with floating debris and fish aggregating devices.',
 ARRAY['SPC Oceanic Fisheries Programme', 'WCPFC Statistical Bulletin'], 1),

('pacific_wide', 'fisheries', 'Transitional Season', 10, 12,
 'Species mix shifting. El Niño and La Niña effects most pronounced in Q4. EEZ boundary catches variable. Annual stock assessment data typically published in this period.',
 ARRAY['SPC Oceanic Fisheries Programme', 'WCPFC Statistical Bulletin'], 1),

('samoa', 'fisheries', 'Albacore Season', 5, 9,
 'Albacore tuna accessible in Samoa EEZ. Longline fishery most active May through September. Export quality peaks during this window. Key revenue period for Samoa fishing industry.',
 ARRAY['MFAT Samoa Fisheries Division', 'SPC'], 1),

('samoa', 'fisheries', 'Skipjack FAD Season', 1, 4,
 'Skipjack aggregating around FADs in Samoan waters. Purse seine activity peaks. Strong correlation with sea surface temperature between 28-30 degrees Celsius.',
 ARRAY['MFAT Samoa Fisheries Division', 'SPC Oceanic Fisheries Programme'], 1),

('fiji', 'fisheries', 'Yellowfin Longline Season', 6, 10,
 'Peak yellowfin longline season in Fijian waters. Export to Japanese sashimi market highest quality. Coral Sea migration patterns influence availability.',
 ARRAY['FijiCoRE', 'SPC Oceanic Fisheries Programme'], 1),

('tonga', 'fisheries', 'Deep Water Snapper Season', 3, 8,
 'Deep water snapper and grouper fishery productive. Artisanal and semi-commercial fishing most active. Important food security period for coastal communities.',
 ARRAY['Ministry of Fisheries Tonga', 'SPC'], 1),

('pacific_wide', 'agriculture', 'Wet Season Planting', 11, 1,
 'Primary planting window for root crops and vegetables across most Pacific islands. High moisture from wet season onset supports germination and early growth. Key period for taro, cassava, and sweet potato.',
 ARRAY['FAO Pacific Agricultural Calendar', 'SPC Rural Development'], 1),

('pacific_wide', 'agriculture', 'Dry Season Harvest', 6, 8,
 'Main harvest window across Pacific region. Copra drying optimal due to reduced humidity. Export quality highest for most commodities including cocoa, coffee, and vanilla. Critical income period for smallholders.',
 ARRAY['FAO Pacific Agricultural Calendar', 'SPC Rural Development'], 1),

('pacific_wide', 'agriculture', 'Cyclone Season Risk', 11, 4,
 'Cyclone season November through April. Agricultural risk highest. Crop insurance claims peak. Post-cyclone replanting guidance critical. Food security vulnerability elevated across low-lying islands.',
 ARRAY['SPREP Climate Division', 'FAO Pacific', 'NDMO Regional'], 1),

('samoa', 'agriculture', 'Taro Planting Season', 10, 12,
 'Primary taro planting window in Samoa. Soil moisture from early rains supports corm development. Alaisa and niue varieties planted. Taro is the primary subsistence and cultural food crop.',
 ARRAY['MAF Samoa', 'FAO Pacific Agricultural Calendar'], 1),

('samoa', 'agriculture', 'Cocoa Harvest', 5, 8,
 'Main cocoa pod harvest in Samoa. Fermentation and drying conditions optimal during dry season months. Export window for quality beans. Savaii and Upolu production zones both active.',
 ARRAY['MAF Samoa', 'Samoa Cocoa Industry Council'], 1),

('samoa', 'agriculture', 'Banana Export Season', 3, 9,
 'Peak banana export quality period. Lady Finger and Cavendish varieties. New Zealand and Pacific regional markets. Cooling temperatures improve shelf life for export.',
 ARRAY['MAF Samoa', 'PIFON'], 1),

('fiji', 'agriculture', 'Sugarcane Harvest', 5, 11,
 'Fiji sugarcane harvesting season May through November. FSC mills operating at capacity. Dominant agricultural export commodity. Western and Northern Division production zones peak.',
 ARRAY['Fiji Sugar Corporation', 'FAO Pacific'], 1),

('fiji', 'agriculture', 'Ginger Export Season', 6, 10,
 'Fijian ginger harvest and export peak. High-value spice export to Australia, New Zealand, and Japan. Organic certification schemes most active during this period.',
 ARRAY['Ministry of Agriculture Fiji', 'PIFON'], 1),

('tonga', 'agriculture', 'Vanilla Harvest', 7, 10,
 'Tongan vanilla harvest season. Hand-pollination complete by June. Curing process begins July. Premium export grade vanilla commands highest prices August-October. Key smallholder income period.',
 ARRAY['Ministry of Agriculture Tonga', 'FAO Pacific'], 1),

('tonga', 'agriculture', 'Squash Export Season', 4, 7,
 'Tongan squash (kabocha) export to Japan. Most significant agricultural export by value. Strict phytosanitary requirements. Japan market timing drives entire agricultural calendar.',
 ARRAY['Ministry of Agriculture Tonga', 'JICA Pacific'], 1),

('pacific_wide', 'climate', 'ENSO Monitoring Period', 9, 3,
 'El Niño Southern Oscillation monitoring most critical September through March. La Niña years bring increased rainfall to western Pacific. El Niño years bring drought risk to Melanesia and parts of Polynesia.',
 ARRAY['Bureau of Meteorology Australia', 'NOAA Climate Prediction Center', 'SPREP'], 1),

('pacific_wide', 'climate', 'Dry Season Climate Baseline', 5, 10,
 'Dry season across most of Pacific. Sea surface temperatures lower. Trade winds strongest. Coral bleaching risk lower than wet season. Best period for baseline climate data collection.',
 ARRAY['SPREP Climate Division', 'NOAA Pacific Islands', 'SPC'], 1);
