// Medicine names suggested while adding a medicine. Focus is on what's sold in India:
// common brands (with what's in them, so typing "paracetamol" also finds Dolo and Calpol),
// imported specialty brands (cancer, biologics, rare disease, transplant) and generic names. Only suggestions — nurses can still type any name.
// One per line: "Brand | what's in it", or just a generic name.

const BRANDS = `
Dolo 650 | Paracetamol
Dolo 500 | Paracetamol
Dolo 1000 | Paracetamol
Dolo Drops | Paracetamol
Dolo 250 Suspension | Paracetamol
Crocin | Paracetamol
Crocin Advance | Paracetamol
Crocin 650 | Paracetamol
Crocin Pain Relief | Paracetamol + Caffeine
Crocin Cold & Flu | Paracetamol + Phenylephrine + Caffeine
Crocin Drops | Paracetamol
Calpol 500 | Paracetamol
Calpol 650 | Paracetamol
Calpol 250 Suspension | Paracetamol
Calpol Drops | Paracetamol
Pacimol 650 | Paracetamol
Pacimol 500 | Paracetamol
Paracip 500 | Paracetamol
Metacin | Paracetamol
P-250 Suspension | Paracetamol
P-650 | Paracetamol
Fepanil | Paracetamol
Combiflam | Ibuprofen + Paracetamol
Combiflam Suspension | Ibuprofen + Paracetamol
Ibugesic Plus | Ibuprofen + Paracetamol
Ibugesic Kids | Ibuprofen + Paracetamol
Brufen 200 | Ibuprofen
Brufen 400 | Ibuprofen
Brufen 600 | Ibuprofen
Meftal Spas | Mefenamic Acid + Dicyclomine
Meftal Forte | Mefenamic Acid + Paracetamol
Meftal 500 | Mefenamic Acid
Meftal P | Mefenamic Acid
Ponstan | Mefenamic Acid
Zerodol | Aceclofenac
Zerodol P | Aceclofenac + Paracetamol
Zerodol SP | Aceclofenac + Paracetamol + Serratiopeptidase
Zerodol TH | Aceclofenac + Thiocolchicoside
Hifenac | Aceclofenac
Hifenac P | Aceclofenac + Paracetamol
Aceclo Plus | Aceclofenac + Paracetamol
Signoflam | Aceclofenac + Paracetamol + Serratiopeptidase
Voveran 50 | Diclofenac
Voveran SR 100 | Diclofenac
Voveran Gel | Diclofenac
Voveran Injection | Diclofenac
Dynapar AQ | Diclofenac
Dynapar QPS Spray | Diclofenac
Reactin | Diclofenac
Diclogesic | Diclofenac
Volini Gel | Diclofenac
Volini Spray | Diclofenac
Moov
Iodex
Zandu Balm
Amrutanjan Balm
Nise | Nimesulide
Nimulid | Nimesulide
Sumo | Nimesulide + Paracetamol
Nucoxia 60 | Etoricoxib
Nucoxia 90 | Etoricoxib
Nucoxia 120 | Etoricoxib
Etoshine 90 | Etoricoxib
Etoshine 120 | Etoricoxib
Celact | Celecoxib
Colcibra | Colchicine
Ketorol DT | Ketorolac
Toradol | Ketorolac
Ultracet | Tramadol + Paracetamol
Tramazac | Tramadol
Contramal | Tramadol
Tramadol Injection | Tramadol
Tapal | Tapentadol
Tydol | Tapentadol
Saridon | Paracetamol + Propyphenazone + Caffeine
Disprin | Aspirin
Ecosprin 75 | Aspirin
Ecosprin 150 | Aspirin
Ecosprin 325 | Aspirin
Ecosprin AV 75 | Aspirin + Atorvastatin
Ecosprin AV 150 | Aspirin + Atorvastatin
Myospaz | Chlorzoxazone + Paracetamol
Myospaz Forte | Chlorzoxazone + Diclofenac + Paracetamol
Myoril | Thiocolchicoside
Thiocol | Thiocolchicoside
Tizan | Tizanidine
Liofen | Baclofen
Myotop | Eperisone
Epry | Eperisone
Cyclopam | Dicyclomine + Paracetamol
Cyclopam Suspension | Dicyclomine + Simethicone
Colimex Drops | Dicyclomine + Simethicone
Buscopan | Hyoscine Butylbromide
Buscopan Injection | Hyoscine Butylbromide
Drotin | Drotaverine
Drotin DS | Drotaverine
Drotin M | Drotaverine + Mefenamic Acid
Pregalin 75 | Pregabalin
Pregeb 75 | Pregabalin
Lyrica 75 | Pregabalin
Pregaba M 75 | Pregabalin + Methylcobalamin
Pregastar M | Pregabalin + Methylcobalamin
Gabapin 300 | Gabapentin
Gabapin NT | Gabapentin + Nortriptyline
Gabantin | Gabapentin
Nurokind | Methylcobalamin
Nurokind LC | Methylcobalamin + L-Carnitine + Folic Acid
Nurokind Gold | Methylcobalamin + Vitamins
Nurokind OD | Methylcobalamin
Methycobal | Methylcobalamin
Mecobalamin
Neurobion Forte | Vitamin B Complex
Neurobion Injection | Vitamin B Complex
Optineuron Injection | Vitamin B Complex
Becosules | Vitamin B Complex + Vitamin C
Becosules Z | Vitamin B Complex + Zinc
Polybion | Vitamin B Complex
Polybion SF Syrup | Vitamin B Complex
Becadexamin | Multivitamin
Cobadex CZS | Vitamin B Complex + Zinc
Zincovit | Multivitamin + Zinc
Zincovit Syrup | Multivitamin + Zinc
Supradyn | Multivitamin
Revital H | Multivitamin + Ginseng
A to Z NS | Multivitamin
Maxirich | Multivitamin
Visyneral Z | Multivitamin + Zinc
Limcee | Vitamin C
Celin 500 | Vitamin C
Evion 400 | Vitamin E
Evion 200 | Vitamin E
Shelcal 500 | Calcium + Vitamin D3
Shelcal HD | Calcium + Vitamin D3
Shelcal XT | Calcium + Vitamin D3
Shelcal Syrup | Calcium + Vitamin D3
Calcimax | Calcium + Vitamin D3
Calcimax P | Calcium + Vitamin D3
Cipcal 500 | Calcium + Vitamin D3
CCM | Calcium Citrate Malate + Vitamin D3
Calcium Sandoz | Calcium
Ostocalcium | Calcium + Vitamin D3
Gemcal | Calcitriol + Calcium
Rocaltrol | Calcitriol
Uprise D3 60K | Cholecalciferol
Calcirol | Cholecalciferol
D-Rise 60K | Cholecalciferol
Tayo 60K | Cholecalciferol
Arachitol | Cholecalciferol
Folvite | Folic Acid
Folvite 5 | Folic Acid
Livogen | Ferrous Fumarate + Folic Acid
Orofer XT | Ferrous Ascorbate + Folic Acid
Orofer XT Syrup | Ferrous Ascorbate + Folic Acid
Orofer S | Iron Sucrose
Feronia XT | Ferrous Ascorbate + Folic Acid
Ferium XT | Ferrous Ascorbate + Folic Acid
Dexorange | Iron + Vitamin B12 + Folic Acid
Fefol | Ferrous Sulphate + Folic Acid
Autrin | Iron + Vitamin B12 + Folic Acid
Tonoferon Syrup | Iron
Ferinject | Ferric Carboxymaltose
Vitcofol Injection | Vitamin B12 + Folic Acid
Maxepa | Omega-3 Fatty Acids
Seacod | Cod Liver Oil
Protinex
Ensure
Pediasure
Glucon-D | Glucose
Electral | Oral Rehydration Salts
Enerzal | Electrolytes
ORS | Oral Rehydration Salts
Pan 40 | Pantoprazole
Pan 20 | Pantoprazole
Pan D | Pantoprazole + Domperidone
Pan IV | Pantoprazole
Pantocid 40 | Pantoprazole
Pantocid 20 | Pantoprazole
Pantocid DSR | Pantoprazole + Domperidone
Pantocid IV | Pantoprazole
Pantop 40 | Pantoprazole
Pantop D | Pantoprazole + Domperidone
Pantodac 40 | Pantoprazole
Pantodac DSR | Pantoprazole + Domperidone
Pantoprazole Injection | Pantoprazole
Razo 20 | Rabeprazole
Razo D | Rabeprazole + Domperidone
Rablet 20 | Rabeprazole
Rablet D | Rabeprazole + Domperidone
Rabeloc 20 | Rabeprazole
Happi 20 | Rabeprazole
Cyra D | Rabeprazole + Domperidone
Veloz 20 | Rabeprazole
Omez 20 | Omeprazole
Omez D | Omeprazole + Domperidone
Ocid 20 | Omeprazole
Nexpro 40 | Esomeprazole
Nexpro 20 | Esomeprazole
Nexpro RD | Esomeprazole + Domperidone
Sompraz 40 | Esomeprazole
Esoz 40 | Esomeprazole
Neksium 40 | Esomeprazole
Lanzol 30 | Lansoprazole
Vonozap 20 | Vonoprazan
Rantac 150 | Ranitidine
Rantac Injection | Ranitidine
Aciloc 150 | Ranitidine
Zinetac 150 | Ranitidine
Famocid 20 | Famotidine
Famocid 40 | Famotidine
Topcid 20 | Famotidine
Digene | Antacid
Digene Gel | Antacid + Simethicone
Gelusil | Antacid
Mucaine Gel | Antacid + Oxetacaine
Polycrol | Antacid + Simethicone
Eno | Sodium Bicarbonate + Citric Acid
Pudin Hara
Gasex
Hajmola
Sucrafil | Sucralfate
Sucrafil O | Sucralfate + Oxetacaine
Sucral O | Sucralfate + Oxetacaine
Domstal | Domperidone
Domstal Suspension | Domperidone
Vomistop | Domperidone
Ondem 4 | Ondansetron
Ondem MD 4 | Ondansetron
Ondem Syrup | Ondansetron
Ondem Injection | Ondansetron
Emeset 4 | Ondansetron
Emeset Injection | Ondansetron
Vomikind MD 4 | Ondansetron
Zofer MD 4 | Ondansetron
Perinorm | Metoclopramide
Perinorm Injection | Metoclopramide
Stemetil | Prochlorperazine
Stemetil MD | Prochlorperazine
Ganaton | Itopride
Itopride 50 | Itopride
Levosiz | Levocetirizine
Levazeo 25 | Levosulpiride
Sulpitac | Levosulpiride
Cremaffin | Liquid Paraffin + Milk of Magnesia
Cremaffin Plus | Liquid Paraffin + Milk of Magnesia + Sodium Picosulfate
Duphalac | Lactulose
Looz | Lactulose
Lactihep | Lactitol
Dulcolax | Bisacodyl
Softovac
Isabgol | Ispaghula Husk
Sat-Isabgol | Ispaghula Husk
Naturolax | Ispaghula Husk
Pegsoft | Polyethylene Glycol
Peglec | Polyethylene Glycol
Laxopeg | Polyethylene Glycol
Eldoper | Loperamide
Imodium | Loperamide
Lomofen | Diphenoxylate + Atropine
Redotil | Racecadotril
Econorm | Saccharomyces boulardii
Enterogermina | Bacillus clausii
Vizylac | Lactobacillus
Sporlac | Lactobacillus
Darolac | Probiotic
Bifilac | Probiotic
Zinconia | Zinc
Z&D Drops | Zinc + Vitamin D
Norflox 400 | Norfloxacin
Norflox TZ | Norfloxacin + Tinidazole
O2 | Ofloxacin + Ornidazole
Zenflox OZ | Ofloxacin + Ornidazole
Oflox OZ | Ofloxacin + Ornidazole
Metrogyl 400 | Metronidazole
Metrogyl 200 | Metronidazole
Metrogyl IV | Metronidazole
Metrogyl Gel | Metronidazole
Flagyl 400 | Metronidazole
Flagyl Suspension | Metronidazole
Tiniba 500 | Tinidazole
Ornof | Ornidazole
Udiliv 300 | Ursodeoxycholic Acid
Udiliv 150 | Ursodeoxycholic Acid
Ursocol 300 | Ursodeoxycholic Acid
Liv 52
Liv 52 DS
Hepamerz | L-Ornithine L-Aspartate
Rifagut 400 | Rifaximin
Rifagut 550 | Rifaximin
Mesacol | Mesalamine
Saaz | Sulfasalazine
Saaz DS | Sulfasalazine
Colospa | Mebeverine
Librax | Chlordiazepoxide + Clidinium
Creon 25000 | Pancreatin
Unienzyme
Aristozyme Syrup
Neopeptine Drops
Colicaid Drops | Simethicone + Dill Oil + Fennel Oil
Bonnisan
Woodward's Gripe Water
Augmentin 625 Duo | Amoxicillin + Clavulanic Acid
Augmentin 375 | Amoxicillin + Clavulanic Acid
Augmentin 1.2 g Injection | Amoxicillin + Clavulanic Acid
Augmentin Duo Syrup | Amoxicillin + Clavulanic Acid
Clavam 625 | Amoxicillin + Clavulanic Acid
Clavam Bid Dry Syrup | Amoxicillin + Clavulanic Acid
Moxikind CV 625 | Amoxicillin + Clavulanic Acid
Moxikind CV 375 | Amoxicillin + Clavulanic Acid
Amoxyclav 625 | Amoxicillin + Clavulanic Acid
Megaclox | Ampicillin + Cloxacillin
Mox 500 | Amoxicillin
Mox 250 | Amoxicillin
Novamox 500 | Amoxicillin
Novamox 250 | Amoxicillin
Azithral 500 | Azithromycin
Azithral 250 | Azithromycin
Azithral Liquid | Azithromycin
Azee 500 | Azithromycin
Azee 250 | Azithromycin
Azee Dry Syrup | Azithromycin
Aziwok 500 | Azithromycin
Zady 500 | Azithromycin
Claribid 500 | Clarithromycin
Claribid 250 | Clarithromycin
Roxid 150 | Roxithromycin
Althrocin 500 | Erythromycin
Doxt SL | Doxycycline
Doxy 1 LDR Forte | Doxycycline + Lactobacillus
Minoz 50 | Minocycline
Ciplox 500 | Ciprofloxacin
Ciplox 250 | Ciprofloxacin
Ciplox TZ | Ciprofloxacin + Tinidazole
Ciplox Eye Drops | Ciprofloxacin
Ciplox D Eye/Ear Drops | Ciprofloxacin + Dexamethasone
Cifran 500 | Ciprofloxacin
Cifran CT | Ciprofloxacin + Tinidazole
Zenflox 200 | Ofloxacin
Zenflox 400 | Ofloxacin
Oflox 200 | Ofloxacin
Oflox 400 | Ofloxacin
Levoflox 500 | Levofloxacin
Levoflox 750 | Levofloxacin
Glevo 500 | Levofloxacin
Glevo 750 | Levofloxacin
Loxof 500 | Levofloxacin
Levomac 500 | Levofloxacin
Moxif 400 | Moxifloxacin
Vigamox Eye Drops | Moxifloxacin
Milflox Eye Drops | Moxifloxacin
Moxicip Eye Drops | Moxifloxacin
Taxim O 200 | Cefixime
Taxim O 100 | Cefixime
Taxim O Dry Syrup | Cefixime
Taxim 1 g Injection | Cefotaxime
Zifi 200 | Cefixime
Zifi 100 | Cefixime
Mahacef 200 | Cefixime
Topcef 200 | Cefixime
Cefolac 200 | Cefixime
Cepodem 200 | Cefpodoxime
Cepodem 100 | Cefpodoxime
Cepodem XP 325 | Cefpodoxime + Clavulanic Acid
Ceftum 500 | Cefuroxime
Ceftum 250 | Cefuroxime
Zocef 500 | Cefuroxime
Sporidex 500 | Cefalexin
Sporidex Redimix | Cefalexin
Phexin 500 | Cefalexin
Cefadrox 500 | Cefadroxil
Monocef 1 g Injection | Ceftriaxone
Monocef SB Injection | Ceftriaxone + Sulbactam
Oframax 1 g Injection | Ceftriaxone
Intacef Tazo | Ceftriaxone + Tazobactam
Fortum Injection | Ceftazidime
Magnex Forte Injection | Cefoperazone + Sulbactam
Magnamycin Injection | Cefoperazone + Sulbactam
Maxipime Injection | Cefepime
Piptaz Injection | Piperacillin + Tazobactam
Tazact Injection | Piperacillin + Tazobactam
Zosyn Injection | Piperacillin + Tazobactam
Meronem Injection | Meropenem
Merotrol Injection | Meropenem
Faronem 200 | Faropenem
Faronem ER 300 | Faropenem
Linospan 600 | Linezolid
Lizolid 600 | Linezolid
Linox 600 | Linezolid
Dalacin C 300 | Clindamycin
Clindac A Gel | Clindamycin
Genticyn Injection | Gentamicin
Mikacin Injection | Amikacin
Vancocin Injection | Vancomycin
Targocid Injection | Teicoplanin
Niftran 100 | Nitrofurantoin
Martifur MR 100 | Nitrofurantoin
Fosirol Sachet | Fosfomycin
Septran DS | Cotrimoxazole
Bactrim DS | Cotrimoxazole
T-Bact Ointment | Mupirocin
Bactroban Ointment | Mupirocin
Fucidin Cream | Fusidic Acid
Soframycin Cream | Framycetin
Neosporin Powder | Neomycin + Polymyxin B + Bacitracin
Neosporin Ointment | Neomycin + Polymyxin B + Bacitracin
Betadine Ointment | Povidone Iodine
Betadine Solution | Povidone Iodine
Betadine Gargle | Povidone Iodine
AKT 4 | Isoniazid + Rifampicin + Pyrazinamide + Ethambutol
AKT 3 | Isoniazid + Rifampicin + Ethambutol
Forecox | Isoniazid + Rifampicin + Pyrazinamide + Ethambutol
R-Cinex | Rifampicin + Isoniazid
Rcinex Z | Rifampicin + Isoniazid + Pyrazinamide
Rifacilin | Rifampicin
Isokin 300 | Isoniazid
Combutol 800 | Ethambutol
Pyzina 750 | Pyrazinamide
Acivir 400 | Acyclovir
Acivir 800 | Acyclovir
Acivir Cream | Acyclovir
Zovirax | Acyclovir
Valcivir 500 | Valacyclovir
Valcivir 1000 | Valacyclovir
Famtrex 500 | Famciclovir
Fabiflu | Favipiravir
Antiflu | Oseltamivir
Fluvir | Oseltamivir
Tamiflu | Oseltamivir
Tenvir | Tenofovir
Tentide | Tenofovir Alafenamide
Entavir 0.5 | Entecavir
Baraclude | Entecavir
Forcan 150 | Fluconazole
Zocon 150 | Fluconazole
Zocon 400 | Fluconazole
Flucos 150 | Fluconazole
Candiforce 200 | Itraconazole
Candiforce 100 | Itraconazole
Itaspor 100 | Itraconazole
Canditral 200 | Itraconazole
Vfend | Voriconazole
Posaforce | Posaconazole
Candid Cream | Clotrimazole
Candid B Cream | Clotrimazole + Beclomethasone
Candid Mouth Paint | Clotrimazole
Candid Dusting Powder | Clotrimazole
Candid V6 | Clotrimazole
Candid Ear Drops | Clotrimazole
Abzorb Powder | Clotrimazole
Clocip Cream | Clotrimazole
Terbicip 250 | Terbinafine
Lamisil Cream | Terbinafine
Luliconz Cream | Luliconazole
Onabet Cream | Sertaconazole
Nizral Cream | Ketoconazole
Nizral Shampoo | Ketoconazole
Ketoz Shampoo | Ketoconazole
Mycoderm C Powder
Ring Guard
Itch Guard
Panderm Plus
Quadriderm RF
Fourderm
Betnovate Cream | Betamethasone
Betnovate N | Betamethasone + Neomycin
Betnovate C | Betamethasone + Clioquinol
Betnovate GM | Betamethasone + Gentamicin + Miconazole
Tenovate Cream | Clobetasol
Tenovate GN | Clobetasol + Gentamicin + Miconazole
Lobate GM | Clobetasol + Gentamicin + Miconazole
Momate Cream | Mometasone
Momate F | Mometasone + Fusidic Acid
Elocon Cream | Mometasone
Fusiderm B | Fusidic Acid + Betamethasone
Silverex Cream | Silver Sulfadiazine
Burnol
Lacto Calamine | Calamine
Caladryl Lotion | Calamine + Diphenhydramine
Permite Cream | Permethrin
Scaboma Lotion | Permethrin
Adaferin Gel | Adapalene
Deriva CMS Gel | Adapalene + Clindamycin
Persol AC Gel | Benzoyl Peroxide
Retino A Cream | Tretinoin
Mintop 5% | Minoxidil
Tugain 5% | Minoxidil
Moisturex Cream | Urea
Boroline
Boroplus
Tacroz Ointment | Tacrolimus
Zentel | Albendazole
Zentel Suspension | Albendazole
Bandy | Albendazole
Bandy Plus | Albendazole + Ivermectin
Noworm | Albendazole
Mebex | Mebendazole
Ivecop 12 | Ivermectin
Ivermectol 12 | Ivermectin
Nizonide 500 | Nitazoxanide
Netazox 500 | Nitazoxanide
HCQS 200 | Hydroxychloroquine
HCQS 400 | Hydroxychloroquine
Lariago | Chloroquine
Resochin | Chloroquine
Falcigo | Artesunate
Larither | Artemether
Lumerax 80 | Artemether + Lumefantrine
Combither | Artemether + Lumefantrine
Primaquine 7.5 | Primaquine
Hetrazan 100 | Diethylcarbamazine
Amlong 5 | Amlodipine
Amlong 2.5 | Amlodipine
Amlong 10 | Amlodipine
Amlokind 5 | Amlodipine
Amlopres 5 | Amlodipine
Amlopres AT | Amlodipine + Atenolol
Amlodac 5 | Amlodipine
Stamlo 5 | Amlodipine
Stamlo Beta | Amlodipine + Atenolol
Amlovas 5 | Amlodipine
Cilacar 10 | Cilnidipine
Cilacar 5 | Cilnidipine
Cilacar T | Cilnidipine + Telmisartan
Cinod 10 | Cilnidipine
Calcigard 10 | Nifedipine
Depin 10 | Nifedipine
Nicardia Retard | Nifedipine
Dilzem 30 | Diltiazem
Dilzem SR 90 | Diltiazem
Calaptin 40 | Verapamil
Aten 50 | Atenolol
Aten 25 | Atenolol
Tenormin 50 | Atenolol
Met XL 25 | Metoprolol
Met XL 50 | Metoprolol
Metolar XR 25 | Metoprolol
Metolar XR 50 | Metoprolol
Starpress XL 25 | Metoprolol
Prolomet XL 50 | Metoprolol
Seloken XL | Metoprolol
Concor 5 | Bisoprolol
Concor 2.5 | Bisoprolol
Nebicard 5 | Nebivolol
Nebistar 5 | Nebivolol
Nebicard SM | Nebivolol + S-Amlodipine
Cardivas 3.125 | Carvedilol
Cardivas 6.25 | Carvedilol
Carca 12.5 | Carvedilol
Ciplar 40 | Propranolol
Ciplar 10 | Propranolol
Ciplar LA 40 | Propranolol
Inderal 40 | Propranolol
Labebet | Labetalol
Telma 40 | Telmisartan
Telma 80 | Telmisartan
Telma 20 | Telmisartan
Telma H | Telmisartan + Hydrochlorothiazide
Telma AM | Telmisartan + Amlodipine
Telma CT | Telmisartan + Chlorthalidone
Telma Beta | Telmisartan + Metoprolol
Telmikind 40 | Telmisartan
Telmikind H | Telmisartan + Hydrochlorothiazide
Telmikind AM | Telmisartan + Amlodipine
Telvas 40 | Telmisartan
Telvas AM | Telmisartan + Amlodipine
Telsartan 40 | Telmisartan
Tazloc 40 | Telmisartan
Losar 50 | Losartan
Losar 25 | Losartan
Losar H | Losartan + Hydrochlorothiazide
Losacar 50 | Losartan
Repace 50 | Losartan
Repace H | Losartan + Hydrochlorothiazide
Covance 50 | Losartan
Olmezest 20 | Olmesartan
Olmezest H | Olmesartan + Hydrochlorothiazide
Olmezest AM | Olmesartan + Amlodipine
Olsar 20 | Olmesartan
Olmat 20 | Olmesartan
Benitec 20 | Olmesartan
Diovan 80 | Valsartan
Valent 80 | Valsartan
Irovel 150 | Irbesartan
Candesar 8 | Candesartan
Zilarbi | Azilsartan
Cardace 5 | Ramipril
Cardace 2.5 | Ramipril
Cardace H | Ramipril + Hydrochlorothiazide
Cardace AM | Ramipril + Amlodipine
Hopace 5 | Ramipril
Envas 5 | Enalapril
Listril 5 | Lisinopril
Coversyl 4 | Perindopril
Aceten 25 | Captopril
Aquazide 12.5 | Hydrochlorothiazide
Thalizide 12.5 | Chlorthalidone
Natrilix SR | Indapamide
Lorvas SR | Indapamide
Lasix 40 | Furosemide
Lasix Injection | Furosemide
Frusenex 40 | Furosemide
Dytor 10 | Torsemide
Dytor 20 | Torsemide
Dytor 5 | Torsemide
Dytor Plus 10 | Torsemide + Spironolactone
Tide 10 | Torsemide
Aldactone 25 | Spironolactone
Aldactone 50 | Spironolactone
Lasilactone 50 | Furosemide + Spironolactone
Eptus 25 | Eplerenone
Metoz 5 | Metolazone
Arkamin | Clonidine
Minipress XL 2.5 | Prazosin
Minipress XL 5 | Prazosin
Aldomet 250 | Methyldopa
Alphadopa 250 | Methyldopa
Vymada 50 | Sacubitril + Valsartan
Vymada 100 | Sacubitril + Valsartan
Arnipin 50 | Sacubitril + Valsartan
Ivabrad 5 | Ivabradine
Lanoxin 0.25 | Digoxin
Cordarone 200 | Amiodarone
Ranolaz 500 | Ranolazine
Ranozex 500 | Ranolazine
Flavedon MR | Trimetazidine
Trivedon MR | Trimetazidine
Nikoran 5 | Nicorandil
Korandil 5 | Nicorandil
Monotrate 20 | Isosorbide Mononitrate
Monotrate OD 30 | Isosorbide Mononitrate
Sorbitrate 5 | Isosorbide Dinitrate
Isordil 5 | Isosorbide Dinitrate
Nitrocontin 2.6 | Nitroglycerin
Angised 0.5 | Nitroglycerin
Atorva 10 | Atorvastatin
Atorva 20 | Atorvastatin
Atorva 40 | Atorvastatin
Storvas 10 | Atorvastatin
Storvas 20 | Atorvastatin
Tonact 10 | Atorvastatin
Tonact 20 | Atorvastatin
Atocor 10 | Atorvastatin
Lipitor 10 | Atorvastatin
Aztor 10 | Atorvastatin
Rozavel 10 | Rosuvastatin
Rozavel 5 | Rosuvastatin
Rozavel 20 | Rosuvastatin
Rosuvas 10 | Rosuvastatin
Rosuvas 20 | Rosuvastatin
Rozat 10 | Rosuvastatin
Rosuvas F 10 | Rosuvastatin + Fenofibrate
Rozucor 10 | Rosuvastatin
Crestor 10 | Rosuvastatin
Simvotin 10 | Simvastatin
Lipicard 160 | Fenofibrate
Fenolip 145 | Fenofibrate
Ezedoc 10 | Ezetimibe
Clopilet 75 | Clopidogrel
Clopilet A 75 | Clopidogrel + Aspirin
Clavix 75 | Clopidogrel
Clavix AS 75 | Clopidogrel + Aspirin
Deplatt 75 | Clopidogrel
Deplatt A 75 | Clopidogrel + Aspirin
Deplatt CV 20 | Clopidogrel + Aspirin + Atorvastatin
Clopitab 75 | Clopidogrel
Clopitab A 75 | Clopidogrel + Aspirin
Plavix 75 | Clopidogrel
Prasita 10 | Prasugrel
Brilinta 90 | Ticagrelor
Axcer 90 | Ticagrelor
Ticamet 90 | Ticagrelor
Warf 5 | Warfarin
Warf 2 | Warfarin
Uniwarfin 5 | Warfarin
Acitrom 2 | Acenocoumarol
Acitrom 1 | Acenocoumarol
Acitrom 4 | Acenocoumarol
Eliquis 5 | Apixaban
Eliquis 2.5 | Apixaban
Apigat 5 | Apixaban
Xarelto 10 | Rivaroxaban
Xarelto 20 | Rivaroxaban
Pradaxa 110 | Dabigatran
Clexane 40 mg Injection | Enoxaparin
Clexane 60 mg Injection | Enoxaparin
Lonopin 40 Injection | Enoxaparin
Heparin Injection | Heparin
Beparine Injection | Heparin
Arixtra Injection | Fondaparinux
Pletoz 100 | Cilostazol
Pletoz 50 | Cilostazol
Trental 400 | Pentoxifylline
Pause 500 | Tranexamic Acid
Pause MF | Tranexamic Acid + Mefenamic Acid
Trapic MF | Tranexamic Acid + Mefenamic Acid
Texakind 500 | Tranexamic Acid
Ethamsyl 500 | Ethamsylate
Kenadion Injection | Vitamin K
Glycomet 500 | Metformin
Glycomet 850 | Metformin
Glycomet 1 g | Metformin
Glycomet SR 500 | Metformin
Glycomet GP 1 | Glimepiride + Metformin
Glycomet GP 2 | Glimepiride + Metformin
Glycomet GP 0.5 | Glimepiride + Metformin
Glyciphage 500 | Metformin
Glyciphage SR 500 | Metformin
Gluconorm SR 500 | Metformin
Obimet SR 500 | Metformin
Okamet 500 | Metformin
Gemer 1 | Glimepiride + Metformin
Gemer 2 | Glimepiride + Metformin
Amaryl 1 | Glimepiride
Amaryl 2 | Glimepiride
Amaryl M1 | Glimepiride + Metformin
Amaryl M2 | Glimepiride + Metformin
Amaryl MV 1 | Glimepiride + Metformin + Voglibose
Glimestar M1 | Glimepiride + Metformin
Glimestar M2 | Glimepiride + Metformin
Glimisave M1 | Glimepiride + Metformin
Glimy 1 | Glimepiride
Zoryl M1 | Glimepiride + Metformin
Glizid 80 | Gliclazide
Glizid M | Gliclazide + Metformin
Reclide 80 | Gliclazide
Diamicron MR 60 | Gliclazide
Glynase 5 | Glipizide
Daonil 5 | Glibenclamide
Januvia 50 | Sitagliptin
Januvia 100 | Sitagliptin
Janumet 50/500 | Sitagliptin + Metformin
Janumet 50/1000 | Sitagliptin + Metformin
Istavel 100 | Sitagliptin
Istamet 50/500 | Sitagliptin + Metformin
Zita Met 50/500 | Sitagliptin + Metformin
Galvus 50 | Vildagliptin
Galvus Met 50/500 | Vildagliptin + Metformin
Jalra 50 | Vildagliptin
Jalra M 50/500 | Vildagliptin + Metformin
Zomelis 50 | Vildagliptin
Zomelis Met 50/500 | Vildagliptin + Metformin
Tenglyn 20 | Teneligliptin
Teneza 20 | Teneligliptin
Dynaglipt 20 | Teneligliptin
Ziten 20 | Teneligliptin
Trajenta 5 | Linagliptin
Trajenta Duo 2.5/500 | Linagliptin + Metformin
Onglyza 5 | Saxagliptin
Forxiga 10 | Dapagliflozin
Forxiga 5 | Dapagliflozin
Oxra 10 | Dapagliflozin
Dapanorm 10 | Dapagliflozin
Gliptagreat 10 | Dapagliflozin
Jardiance 10 | Empagliflozin
Jardiance 25 | Empagliflozin
Glyxambi 10/5 | Empagliflozin + Linagliptin
Remo 100 | Remogliflozin
Pioz 15 | Pioglitazone
Pioz 30 | Pioglitazone
Pioglit 15 | Pioglitazone
Volix 0.2 | Voglibose
Volix 0.3 | Voglibose
Voglinorm 0.3 | Voglibose
Glucobay 50 | Acarbose
Eurepa 1 | Repaglinide
Rybelsus 3 | Semaglutide
Rybelsus 7 | Semaglutide
Rybelsus 14 | Semaglutide
Ozempic | Semaglutide
Wegovy | Semaglutide
Mounjaro | Tirzepatide
Trulicity | Dulaglutide
Victoza | Liraglutide
Human Mixtard 30/70 | Insulin (premixed)
Huminsulin R | Insulin Regular
Huminsulin N | Insulin NPH
Huminsulin 30/70 | Insulin (premixed)
Huminsulin 50/50 | Insulin (premixed)
Actrapid | Insulin Regular
Insulatard | Insulin NPH
Wosulin R | Insulin Regular
Wosulin 30/70 | Insulin (premixed)
Insugen 30/70 | Insulin (premixed)
Insugen R | Insulin Regular
Lantus | Insulin Glargine
Lantus Solostar | Insulin Glargine
Basalog | Insulin Glargine
Glaritus | Insulin Glargine
Toujeo | Insulin Glargine
Tresiba | Insulin Degludec
Ryzodeg | Insulin Degludec + Insulin Aspart
Novorapid | Insulin Aspart
Novomix 30 | Insulin Aspart (premixed)
Humalog | Insulin Lispro
Humalog Mix 25 | Insulin Lispro (premixed)
Levemir | Insulin Detemir
Apidra | Insulin Glulisine
Thyronorm 12.5 | Levothyroxine
Thyronorm 25 | Levothyroxine
Thyronorm 50 | Levothyroxine
Thyronorm 75 | Levothyroxine
Thyronorm 88 | Levothyroxine
Thyronorm 100 | Levothyroxine
Thyronorm 125 | Levothyroxine
Thyronorm 150 | Levothyroxine
Eltroxin 25 | Levothyroxine
Eltroxin 50 | Levothyroxine
Eltroxin 100 | Levothyroxine
Thyrox 25 | Levothyroxine
Thyrox 50 | Levothyroxine
Thyrox 100 | Levothyroxine
Lethyrox 50 | Levothyroxine
Neo-Mercazole 5 | Carbimazole
Neo-Mercazole 10 | Carbimazole
Thyrocab 10 | Carbimazole
Wysolone 5 | Prednisolone
Wysolone 10 | Prednisolone
Wysolone 20 | Prednisolone
Omnacortil 5 | Prednisolone
Omnacortil 10 | Prednisolone
Omnacortil 20 | Prednisolone
Omnacortil 40 | Prednisolone
Medrol 4 | Methylprednisolone
Medrol 8 | Methylprednisolone
Medrol 16 | Methylprednisolone
Solu-Medrol Injection | Methylprednisolone
Dexona | Dexamethasone
Dexona Injection | Dexamethasone
Decadron | Dexamethasone
Betnesol | Betamethasone
Betnesol Injection | Betamethasone
Defcort 6 | Deflazacort
Defcort 30 | Deflazacort
Defza 6 | Deflazacort
Efcorlin Injection | Hydrocortisone
Lycortin-S Injection | Hydrocortisone
Duphaston 10 | Dydrogesterone
Susten 200 | Progesterone
Susten 100 | Progesterone
Susten Injection | Progesterone
Regestrone 5 | Norethisterone
Primolut N | Norethisterone
Meprate 10 | Medroxyprogesterone
Deviry 10 | Medroxyprogesterone
Progynova 2 | Estradiol
Fertyl 50 | Clomiphene
Siphene 50 | Clomiphene
Letroz 2.5 | Letrozole
Femara 2.5 | Letrozole
Cabgolin 0.5 | Cabergoline
Caberlin 0.5 | Cabergoline
Proviron 25 | Mesterolone
Mala-D | Levonorgestrel + Ethinylestradiol
Mala-N | Levonorgestrel + Ethinylestradiol
Ovral L | Levonorgestrel + Ethinylestradiol
Novelon | Desogestrel + Ethinylestradiol
Yasmin | Drospirenone + Ethinylestradiol
Krimson 35 | Cyproterone + Ethinylestradiol
Unwanted 72 | Levonorgestrel
i-pill | Levonorgestrel
Saheli | Ormeloxifene
Misoprost 200 | Misoprostol
Methergin | Methylergometrine
Pitocin Injection | Oxytocin
Alendronate 70 | Alendronate
Osteofos 70 | Alendronate
Zoldria Injection | Zoledronic Acid
Forteo | Teriparatide
Minirin | Desmopressin
Asthalin Inhaler | Salbutamol
Asthalin 4 | Salbutamol
Asthalin Syrup | Salbutamol
Asthalin Respules | Salbutamol
Asthalin Rotacaps | Salbutamol
Levolin Inhaler | Levosalbutamol
Levolin Respules | Levosalbutamol
Levolin Syrup | Levosalbutamol
Duolin Inhaler | Levosalbutamol + Ipratropium
Duolin Respules | Levosalbutamol + Ipratropium
Duolin 3 Respules | Levosalbutamol + Ipratropium
Ipravent Inhaler | Ipratropium
Ipravent Respules | Ipratropium
Tiova Inhaler | Tiotropium
Tiova Rotacaps | Tiotropium
Foracort 200 Inhaler | Formoterol + Budesonide
Foracort 400 Inhaler | Formoterol + Budesonide
Foracort Rotacaps | Formoterol + Budesonide
Foracort Respules | Formoterol + Budesonide
Budecort 200 Inhaler | Budesonide
Budecort Respules | Budesonide
Pulmicort Respules | Budesonide
Seroflo 125 Inhaler | Salmeterol + Fluticasone
Seroflo 250 Inhaler | Salmeterol + Fluticasone
Seroflo 500 Rotacaps | Salmeterol + Fluticasone
Flohale 125 | Fluticasone
Beclate 200 | Beclomethasone
Ciclohale 200 | Ciclesonide
Synflo 250 | Salmeterol + Fluticasone
Airtec Inhaler | Formoterol + Fluticasone
Ventorlin Inhaler | Salbutamol
Montair 10 | Montelukast
Montair 4 | Montelukast
Montair LC | Montelukast + Levocetirizine
Montair LC Kid | Montelukast + Levocetirizine
Montair FX | Montelukast + Fexofenadine
Montek LC | Montelukast + Levocetirizine
Montek 10 | Montelukast
Telekast L | Montelukast + Levocetirizine
Romilast L | Montelukast + Levocetirizine
Montina L | Montelukast + Levocetirizine
Levocet M | Levocetirizine + Montelukast
Allegra M | Fexofenadine + Montelukast
Deriphyllin | Etofylline + Theophylline
Deriphyllin Retard 150 | Etofylline + Theophylline
Deriphyllin Injection | Etofylline + Theophylline
Theo-Asthalin | Theophylline + Salbutamol
Unicontin 400 | Theophylline
Doxolin 400 | Doxofylline
Doxofen 400 | Doxofylline
Synasma 400 | Doxofylline
Ab-Phylline 100 | Acebrophylline
Ab-Flo N | Acebrophylline + N-Acetylcysteine
Roflast 500 | Roflumilast
Mucinac 600 | N-Acetylcysteine
Fluimucil 600 | N-Acetylcysteine
Mucolite | Ambroxol
Mucolite Syrup | Ambroxol
Ambrodil S Syrup | Ambroxol + Salbutamol
Ascoril LS Syrup | Ambroxol + Levosalbutamol + Guaifenesin
Ascoril LS Drops | Ambroxol + Levosalbutamol + Guaifenesin
Ascoril D Plus | Dextromethorphan + Phenylephrine + Chlorpheniramine
Ascoril C Syrup | Codeine + Chlorpheniramine
Ascoril Plus | Bromhexine + Guaifenesin + Terbutaline
Ascoril Flu
Benadryl Cough Syrup | Diphenhydramine + Ammonium Chloride
Benadryl DR | Dextromethorphan
Grilinctus Syrup | Dextromethorphan + Chlorpheniramine + Guaifenesin
Grilinctus BM | Bromhexine + Guaifenesin + Terbutaline
Corex DX | Dextromethorphan + Chlorpheniramine
Chericof Syrup
Alex Syrup | Dextromethorphan + Phenylephrine + Chlorpheniramine
Tossex Syrup
Zedex Syrup | Dextromethorphan + Chlorpheniramine
TusQ DX | Dextromethorphan + Chlorpheniramine
Cofsils Syrup
Honitus Syrup
Koflet Syrup
Dabur Honitus
Strepsils
Cofsils Lozenges
Vicks Vaporub
Vicks Action 500
Vicks Cough Drops
Cheston Cold | Cetirizine + Paracetamol + Phenylephrine
Sinarest | Paracetamol + Phenylephrine + Chlorpheniramine
Sinarest Syrup | Paracetamol + Phenylephrine + Chlorpheniramine
Wikoryl | Paracetamol + Phenylephrine + Chlorpheniramine
D-Cold Total
Febrex Plus | Paracetamol + Phenylephrine + Chlorpheniramine
Coldact
Okacet | Cetirizine
Cetzine | Cetirizine
Alerid | Cetirizine
Zyrtec | Cetirizine
Levocet 5 | Levocetirizine
Xyzal | Levocetirizine
Teczine | Levocetirizine
L-Dio | Levocetirizine
Allegra 120 | Fexofenadine
Allegra 180 | Fexofenadine
Allegra Suspension | Fexofenadine
Fexova 120 | Fexofenadine
Lorfast | Loratadine
Deslor 5 | Desloratadine
Bilaxten 20 | Bilastine
Rupanex 10 | Rupatadine
Avil 25 | Pheniramine
Avil Injection | Pheniramine
Atarax 10 | Hydroxyzine
Atarax 25 | Hydroxyzine
Phenergan | Promethazine
Practin | Cyproheptadine
Otrivin Nasal Drops | Xylometazoline
Otrivin Nasal Spray | Xylometazoline
Nasivion Nasal Drops | Oxymetazoline
Nasivion Mini | Oxymetazoline
Nasoclear Nasal Spray | Sodium Chloride
Flomist Nasal Spray | Fluticasone
Avamys Nasal Spray | Fluticasone Furoate
Metaspray Nasal Spray | Mometasone
Nasonex Nasal Spray | Mometasone
Azep Nasal Spray | Azelastine
Eptoin 100 | Phenytoin
Eptoin Injection | Phenytoin
Dilantin 100 | Phenytoin
Tegretol 200 | Carbamazepine
Tegretol CR 200 | Carbamazepine
Mazetol 200 | Carbamazepine
Oxetol 300 | Oxcarbazepine
Oxetol 600 | Oxcarbazepine
Valparin 200 | Sodium Valproate
Valparin Chrono 500 | Sodium Valproate
Encorate 200 | Sodium Valproate
Encorate Chrono 500 | Sodium Valproate
Valprol CR 500 | Sodium Valproate
Dicorate ER 500 | Divalproex
Levipil 500 | Levetiracetam
Levipil 250 | Levetiracetam
Levipil Injection | Levetiracetam
Levera 500 | Levetiracetam
Keppra 500 | Levetiracetam
Brivasure 50 | Brivaracetam
Lacoset 100 | Lacosamide
Lamitor 50 | Lamotrigine
Lamitor 100 | Lamotrigine
Lametec 50 | Lamotrigine
Topamac 25 | Topiramate
Topamac 50 | Topiramate
Zonisep 100 | Zonisamide
Frisium 10 | Clobazam
Frisium 5 | Clobazam
Clonotril 0.5 | Clonazepam
Rivotril 0.5 | Clonazepam
Lonazep 0.5 | Clonazepam
Petril 0.5 | Clonazepam
Ativan 2 | Lorazepam
Ativan 1 | Lorazepam
Calmpose 5 | Diazepam
Valium 5 | Diazepam
Restyl 0.25 | Alprazolam
Restyl 0.5 | Alprazolam
Alprax 0.25 | Alprazolam
Alprax 0.5 | Alprazolam
Trika 0.25 | Alprazolam
Etilaam 0.5 | Etizolam
Etizola 0.5 | Etizolam
Mezolam Injection | Midazolam
Gardenal 60 | Phenobarbital
Donep 5 | Donepezil
Donep 10 | Donepezil
Aricep 5 | Donepezil
Admenta 5 | Memantine
Admenta 10 | Memantine
Exelon Patch | Rivastigmine
Syndopa Plus | Levodopa + Carbidopa
Syndopa 275 | Levodopa + Carbidopa
Syndopa CR | Levodopa + Carbidopa
Tidomet Plus | Levodopa + Carbidopa
Pramipex 0.25 | Pramipexole
Ropark 0.5 | Ropinirole
Rasalect 1 | Rasagiline
Pacitane 2 | Trihexyphenidyl
Amantrel 100 | Amantadine
Suminat 50 | Sumatriptan
Rizact 10 | Rizatriptan
Sibelium 5 | Flunarizine
Sibelium 10 | Flunarizine
Flunarin 10 | Flunarizine
Stugeron 25 | Cinnarizine
Vertin 8 | Betahistine
Vertin 16 | Betahistine
Vertin 24 | Betahistine
Vertigon | Prochlorperazine
Strocit 500 | Citicoline
Citicol 500 | Citicoline
Nootropil 800 | Piracetam
Nimodip 30 | Nimodipine
Mestinon 60 | Pyridostigmine
Daxid 50 | Sertraline
Daxid 100 | Sertraline
Serlift 50 | Sertraline
Zosert 50 | Sertraline
Serta 50 | Sertraline
Nexito 10 | Escitalopram
Nexito 5 | Escitalopram
Nexito Plus | Escitalopram + Clonazepam
Stalopam 10 | Escitalopram
Cipralex 10 | Escitalopram
Feliz S 10 | Escitalopram
Fludac 20 | Fluoxetine
Prodep 20 | Fluoxetine
Flunil 20 | Fluoxetine
Paxidep CR 12.5 | Paroxetine
Paxidep CR 25 | Paroxetine
Fluvoxin 50 | Fluvoxamine
Venlor XR 75 | Venlafaxine
Desvenlor 50 | Desvenlafaxine
Mirtaz 15 | Mirtazapine
Mirtaz 7.5 | Mirtazapine
Bupron SR 150 | Bupropion
Trazonil 50 | Trazodone
Brintellix 10 | Vortioxetine
Duzela 20 | Duloxetine
Duzela 30 | Duloxetine
Dulane 20 | Duloxetine
Sympta 20 | Duloxetine
Tryptomer 10 | Amitriptyline
Tryptomer 25 | Amitriptyline
Sarotena 10 | Amitriptyline
Sensival 25 | Nortriptyline
Depsonil 25 | Imipramine
Clofranil 25 | Clomipramine
Prothiaden 25 | Dosulepin
Oleanz 5 | Olanzapine
Oleanz 10 | Olanzapine
Oliza 5 | Olanzapine
Risdone 2 | Risperidone
Sizodon 2 | Risperidone
Qutipin 25 | Quetiapine
Qutipin 50 | Quetiapine
Qutan 25 | Quetiapine
Seroquel 25 | Quetiapine
Arip MT 10 | Aripiprazole
Arip MT 5 | Aripiprazole
Serenace 5 | Haloperidol
Serenace Injection | Haloperidol
Sizopin 25 | Clozapine
Sizopin 100 | Clozapine
Invega 6 | Paliperidone
Amisulpride 100
Lurasid 40 | Lurasidone
Largactil | Chlorpromazine
Espazine 5 | Trifluoperazine
Licab 300 | Lithium
Lithosun SR 400 | Lithium
Zolfresh 10 | Zolpidem
Zolfresh 5 | Zolpidem
Nitrest 10 | Zolpidem
Meloset 3 | Melatonin
Addwize 10 | Methylphenidate
Inspiral 10 | Methylphenidate
Axepta 10 | Atomoxetine
Naltima 50 | Naltrexone
Esperal 250 | Disulfiram
Acamprol 333 | Acamprosate
Urimax 0.4 | Tamsulosin
Urimax D | Tamsulosin + Dutasteride
Urimax F | Tamsulosin + Finasteride
Veltam 0.4 | Tamsulosin
Veltam Plus | Tamsulosin + Dutasteride
Contiflo OD 0.4 | Tamsulosin
Silodal 8 | Silodosin
Silodal 4 | Silodosin
Rapilif 8 | Silodosin
Alfusin 10 | Alfuzosin
Dutas 0.5 | Dutasteride
Fincar 5 | Finasteride
Finpecia 1 | Finasteride
Soliten 5 | Solifenacin
Vesicare 5 | Solifenacin
Roliten 2 | Tolterodine
Oxyspas 5 | Oxybutynin
Mirago 25 | Mirabegron
Cystone
Citralka Syrup | Disodium Hydrogen Citrate
Alkasol Syrup | Disodium Hydrogen Citrate
Urikind KM | Potassium Magnesium Citrate
K-Cit | Potassium Citrate
Sevcar 400 | Sevelamer
Renvela 800 | Sevelamer
Cinacal 30 | Cinacalcet
Wepox Injection | Erythropoietin
Manforce 50 | Sildenafil
Manforce 100 | Sildenafil
Suhagra 50 | Sildenafil
Penegra 50 | Sildenafil
Tadacip 20 | Tadalafil
Megalis 10 | Tadalafil
Megalis 20 | Tadalafil
Febuget 40 | Febuxostat
Febuget 80 | Febuxostat
Febutaz 40 | Febuxostat
Zyloric 100 | Allopurinol
Zyloric 300 | Allopurinol
Zycolchin 0.5 | Colchicine
Folitrax 7.5 | Methotrexate
Folitrax 10 | Methotrexate
Folitrax 15 | Methotrexate
Imutrex 7.5 | Methotrexate
Azoran 50 | Azathioprine
Cellcept 500 | Mycophenolate Mofetil
Mycept 500 | Mycophenolate Mofetil
Mycept S 360 | Mycophenolate Sodium
Pangraf 1 | Tacrolimus
Pangraf 0.5 | Tacrolimus
Panimun Bioral 50 | Cyclosporine
Lefno 20 | Leflunomide
Lefno 10 | Leflunomide
Tofacent 5 | Tofacitinib
Endoxan 50 | Cyclophosphamide
Veenat 400 | Imatinib
Cytotam 20 | Tamoxifen
Armotraz 1 | Anastrozole
Xeloda 500 | Capecitabine
Hydrea 500 | Hydroxyurea
Calutide 50 | Bicalutamide
Abiratas 250 | Abiraterone
Refresh Tears | Carboxymethylcellulose
Refresh Liquigel | Carboxymethylcellulose
Lubrex Eye Drops | Carboxymethylcellulose
Tears Naturale | Hypromellose + Dextran
Genteal Eye Gel | Hypromellose
I-Kul Eye Drops
Itone Eye Drops
Toba Eye Drops | Tobramycin
Tobradex Eye Drops | Tobramycin + Dexamethasone
Tobastar Eye Drops | Tobramycin
Pred Forte Eye Drops | Prednisolone Acetate
Ocupol D Eye Drops | Chloramphenicol + Polymyxin B + Dexamethasone
Chlormycetin Applicaps | Chloramphenicol
Iotim 0.5 Eye Drops | Timolol
Timolet Eye Drops | Timolol
Xalatan Eye Drops | Latanoprost
9PM Eye Drops | Latanoprost
Alphagan P Eye Drops | Brimonidine
Combigan Eye Drops | Brimonidine + Timolol
Dorzox Eye Drops | Dorzolamide
Nepafenac Eye Drops | Nepafenac
Olopat Eye Drops | Olopatadine
Atropine Eye Drops | Atropine
Tropicamide Eye Drops | Tropicamide
Waxolve Ear Drops
Soliwax Ear Drops
Candibiotic Plus Ear Drops
Otorex Ear Drops
Hexidine Mouthwash | Chlorhexidine
Rexidin M Forte Gel | Chlorhexidine + Metronidazole
Zytee Gel | Choline Salicylate
Dologel CT | Choline Salicylate + Lidocaine
Mucopain Gel | Benzocaine
Orahex Mouthwash | Chlorhexidine
Lignox 2% Injection | Lidocaine
Xylocaine 2% Jelly | Lidocaine
Xylocaine Spray | Lidocaine
Emla Cream | Lidocaine + Prilocaine
TT Injection | Tetanus Toxoid
Rabipur | Rabies Vaccine
Vaxirab N | Rabies Vaccine
Engerix-B | Hepatitis B Vaccine
Influvac Tetra | Influenza Vaccine
Normal Saline 0.9% | Sodium Chloride
NS 0.9% IV | Sodium Chloride
RL IV | Ringer Lactate
DNS IV | Dextrose + Sodium Chloride
D5 IV | Dextrose 5%
D10 IV | Dextrose 10%
D25 Injection | Dextrose 25%
Mannitol 20% IV | Mannitol
Paracetamol Infusion | Paracetamol
Neomol Infusion | Paracetamol
Pacimol IV | Paracetamol
Albumin 20% | Human Albumin
KCl Injection | Potassium Chloride
Calcium Gluconate Injection | Calcium Gluconate
Magnesium Sulphate Injection | Magnesium Sulphate
Sodabicarb Injection | Sodium Bicarbonate
Adrenaline Injection | Adrenaline
Atropine Injection | Atropine
Septilin
Cystone Syrup
Himalaya Ashwagandha | Ashwagandha
Dabur Chyawanprash
Triphala Churna | Triphala
Giloy Ghanvati | Giloy
Tulsi Drops | Tulsi
Neeri Syrup
Pilex
Rumalaya Forte
Arjuna Capsules | Arjuna
Shatavari | Shatavari
Brahmi | Brahmi
Nicotex Gum | Nicotine
Champix 1 | Varenicline
Obelit 120 | Orlistat
Biotin 10 mg | Biotin
CoQ 300 | Coenzyme Q10

Systane Ultra | Polyethylene Glycol + Propylene Glycol
Systane Ultra UD | Polyethylene Glycol + Propylene Glycol
Systane Balance | Propylene Glycol
Systane Complete | Propylene Glycol
Systane Hydration | Polyethylene Glycol + Propylene Glycol + Hyaluronic Acid
Systane Gel Drops | Polyethylene Glycol + Propylene Glycol
Systane Eye Drops | Polyethylene Glycol + Propylene Glycol
Refresh Plus | Carboxymethylcellulose
Refresh Gel | Carboxymethylcellulose
Refresh Tears UD | Carboxymethylcellulose
Optive Eye Drops | Carboxymethylcellulose + Glycerin
Optive Fusion | Carboxymethylcellulose + Glycerin + Hyaluronic Acid
Celluvisc Eye Drops | Carboxymethylcellulose
Lubrex DS Eye Drops | Carboxymethylcellulose
Eyemist Eye Drops | Hypromellose
Eyemist Gel | Hypromellose
Moisol Eye Drops
Tears Plus Eye Drops
Lacrigel Eye Gel | Carbomer
Viscotears Eye Gel | Carbomer
Hylo Eye Drops | Sodium Hyaluronate
Hylo Forte Eye Drops | Sodium Hyaluronate
Aquatears Eye Drops
Cmc 0.5% Eye Drops | Carboxymethylcellulose
Hypersol 6 Eye Drops | Sodium Chloride 6%
Restasis Eye Drops | Cyclosporine
Cyclomune Eye Drops | Cyclosporine
Ikervis Eye Drops | Cyclosporine
Talimus Eye Drops | Tacrolimus
Zymar Eye Drops | Gatifloxacin
Gatiquin Eye Drops | Gatifloxacin
Gatilox Eye Drops | Gatifloxacin
Zylet Eye Drops | Loteprednol + Tobramycin
Apdrops Eye Drops | Moxifloxacin + Dexamethasone
Apdrops DM Eye Drops | Moxifloxacin + Dexamethasone
Moxicip D Eye Drops | Moxifloxacin + Dexamethasone
Milflox DF Eye Drops | Moxifloxacin + Difluprednate
Moxigram Eye Drops | Moxifloxacin
Tobaflam Eye Drops | Tobramycin + Flurbiprofen
Tobacin Eye Drops | Tobramycin
Tobrex Eye Drops | Tobramycin
Ocuflur Eye Drops | Flurbiprofen
Nevanac Eye Drops | Nepafenac
Acular LS Eye Drops | Ketorolac
Ketlur Eye Drops | Ketorolac
Lotepred Eye Drops | Loteprednol
Lotemax Eye Drops | Loteprednol
FML Eye Drops | Fluorometholone
Flarex Eye Drops | Fluorometholone
Predmet Eye Drops | Prednisolone
Exocin Eye Drops | Ofloxacin
Zenflox Eye Drops | Ofloxacin
Oflox Eye Drops | Ofloxacin
Chlorocol Eye Drops | Chloramphenicol
Pataday Eye Drops | Olopatadine
Patanol Eye Drops | Olopatadine
Winolap Eye Drops | Olopatadine
Olopat DS Eye Drops | Olopatadine
Bepreve Eye Drops | Bepotastine
Zaditen Eye Drops | Ketotifen
Naphcon A Eye Drops | Naphazoline + Pheniramine
Clear Eyes Eye Drops | Naphazoline
Ophthacare Eye Drops
Rohto Cool Eye Drops
Travatan Eye Drops | Travoprost
Lumigan Eye Drops | Bimatoprost
Careprost Eye Drops | Bimatoprost
Ganfort Eye Drops | Bimatoprost + Timolol
Xalacom Eye Drops | Latanoprost + Timolol
Cosopt Eye Drops | Dorzolamide + Timolol
Azopt Eye Drops | Brinzolamide
Simbrinza Eye Drops | Brinzolamide + Brimonidine
Iobrim Eye Drops | Brimonidine
Brimocom Eye Drops | Brimonidine + Timolol
Glucomol Eye Drops | Timolol
Timolast Eye Drops | Timolol
Tropicacyl Plus Eye Drops | Tropicamide + Phenylephrine
Cyclomid Eye Drops | Cyclopentolate
Atrosulph Eye Drops | Atropine
Zovirax Eye Ointment | Acyclovir
Acivir Eye Ointment | Acyclovir
Natamet Eye Drops | Natamycin
Ocuvite | Eye Vitamins
Clearwax Ear Drops | Paradichlorobenzene + Benzocaine
Otek-AC Ear Drops
Oflox Ear Drops | Ofloxacin
Ciplox Ear Drops | Ciprofloxacin
Otogesic Ear Drops
Dymista Nasal Spray | Azelastine + Fluticasone
Rhinocort Nasal Spray | Budesonide
Otrivin Oxy Nasal Spray | Oxymetazoline
Nasivion S Nasal Drops | Sodium Chloride
Zincovit Drops | Multivitamin + Zinc
Visyneral Drops | Multivitamin
A to Z Drops | Multivitamin
Tonoferon Drops | Iron
Dvion Drops | Cholecalciferol
Polybion Drops | Vitamin B Complex
Ibugesic Plus Drops | Ibuprofen + Paracetamol
Meftal P Drops | Mefenamic Acid
Ondem Drops | Ondansetron
Simethicone Drops | Simethicone
Cypon Syrup | Cyproheptadine
Practin Syrup | Cyproheptadine
Brozeet LS Syrup | Ambroxol + Levosalbutamol + Guaifenesin
Ambrolite S Syrup | Ambroxol + Salbutamol
Bro-Zedex Syrup | Bromhexine + Guaifenesin + Terbutaline
Torex Syrup
Glycodin Syrup
Kofarest Syrup
Kofol Syrup
T-Minic Syrup
Maxtra Syrup
Cetzine Syrup | Cetirizine
Levocet Syrup | Levocetirizine
Atarax Syrup | Hydroxyzine
Avil Syrup | Pheniramine
Montair LC Syrup | Montelukast + Levocetirizine
Digene Syrup | Antacid + Simethicone
Gelusil MPS Syrup | Antacid + Simethicone
Septilin Syrup
Liv 52 Syrup
Ostocalcium Syrup | Calcium + Vitamin D3
Calcimax Syrup | Calcium + Vitamin D3
Crocin Syrup | Paracetamol
Ibugesic Syrup | Ibuprofen
Meftal P Suspension | Mefenamic Acid
Bandy Suspension | Albendazole
Zifi Dry Syrup | Cefixime
Cepodem Dry Syrup | Cefpodoxime
Mox Kid Dry Syrup | Amoxicillin
Ventorlin Syrup | Salbutamol
Raricap Syrup | Iron
Haemup Syrup | Iron + Multivitamin
Dexorange Syrup | Iron + Vitamin B12 + Folic Acid
Pancharishta
Dashmularishta
Abhayarishta
Ashokarishta
Kumaryasava
Lohasava
Azax 500 | Azithromycin
ATM 500 | Azithromycin
Zithrox 500 | Azithromycin
Ciprobid 500 | Ciprofloxacin
Quintor 500 | Ciprofloxacin
Cipval 500 | Ciprofloxacin
Lquin 500 | Levofloxacin
Tavanic 500 | Levofloxacin
Microdox LBX | Doxycycline + Lactobacillus
Biodoxi 100 | Doxycycline
Blumox 500 | Amoxicillin
Almox 500 | Amoxicillin
Moxclav 625 | Amoxicillin + Clavulanic Acid
Advent 625 | Amoxicillin + Clavulanic Acid
Augpen 625 | Amoxicillin + Clavulanic Acid
Tarivid 200 | Ofloxacin
Norbactin 400 | Norfloxacin
Aristogyl 400 | Metronidazole
Cefix 200 | Cefixime
Hifen 200 | Cefixime
Ceftas 200 | Cefixime
Doxcef 200 | Cefpodoxime
Monocef O 200 | Cefpodoxime
Altacef 500 | Cefuroxime
Linid 600 | Linezolid
Dart | Paracetamol + Propyphenazone + Caffeine
Anacin | Paracetamol + Caffeine
Zupar | Ibuprofen + Paracetamol
Flexon | Ibuprofen + Paracetamol
Ibuclin | Ibuprofen + Paracetamol
Nicip | Nimesulide
Nicip Plus | Nimesulide + Paracetamol
Ketanov | Ketorolac
Ketanov Injection | Ketorolac
Etova 400 | Etodolac
Etova ER 600 | Etodolac
Arcoxia 90 | Etoricoxib
Mobizox | Chlorzoxazone + Diclofenac + Paracetamol
Zerodol MR | Aceclofenac + Paracetamol + Chlorzoxazone
Aceclo MR | Aceclofenac + Paracetamol + Chlorzoxazone
Hifenac MR | Aceclofenac + Paracetamol + Chlorzoxazone
Diclomol | Diclofenac + Paracetamol
Dolonex DT | Piroxicam
Indocap SR | Indomethacin
Naxdom 500 | Naproxen + Domperidone
Naprosyn 500 | Naproxen
Voveran AQ Injection | Diclofenac
Fortwin Injection | Pentazocine
Drotin Injection | Drotaverine
Phenergan Injection | Promethazine
Stemetil Injection | Prochlorperazine
Ativan Injection | Lorazepam
Vitamin K Injection | Vitamin K
Anti Snake Venom | Snake Venom Antiserum
Ceftriaxone 1 g Injection | Ceftriaxone
Pan DSR | Pantoprazole + Domperidone
Lesuride 25 | Levosulpiride
Motilium | Domperidone
Lomotil | Diphenoxylate + Atropine
Nexium 40 | Esomeprazole
Amtas 5 | Amlodipine
Amlogard 5 | Amlodipine
Norvasc 5 | Amlodipine
Sartel 40 | Telmisartan
Sartel H | Telmisartan + Hydrochlorothiazide
Arbitel 40 | Telmisartan
Olmy 20 | Olmesartan
Rosave 10 | Rosuvastatin
Atorlip 10 | Atorvastatin
Lipvas 10 | Atorvastatin
Bigomet SR 500 | Metformin
Exermet 500 | Metformin
Glimiprex 1 | Glimepiride
Gibtulio 10 | Empagliflozin
Neurobion Plus | Vitamin B Complex
B-Complex Forte | Vitamin B Complex
Epilex 200 | Sodium Valproate
Alzolam 0.25 | Alprazolam
S Citadep 10 | Escitalopram
Rexipra 10 | Escitalopram
Sertima 50 | Sertraline
Olimelt 5 | Olanzapine
Respidon 2 | Risperidone
Betavert 16 | Betahistine
Dramamine | Dimenhydrinate
Avomine | Promethazine
Doxinate | Doxylamine + Pyridoxine
Formonide 200 Inhaler | Formoterol + Budesonide
Budamate 200 Inhaler | Formoterol + Budesonide
Combitide 250 Inhaler | Salmeterol + Fluticasone
Vozet 5 | Levocetirizine
Ebast 10 | Ebastine
Visanne | Dienogest
Clomid 50 | Clomiphene
Letoval 2.5 | Letrozole
Gestone Injection | Progesterone
Hucog Injection | Human Chorionic Gonadotropin
Clop G Cream | Clobetasol + Gentamicin
Fucibet Cream | Fusidic Acid + Betamethasone
Supirocin Ointment | Mupirocin
Terbinaforce 250 | Terbinafine
Sebifin Cream | Terbinafine
Ketomac Shampoo | Ketoconazole
Selsun Shampoo | Selenium Sulphide
Benzac AC Gel | Benzoyl Peroxide
Nadoxin Cream | Nadifloxacin
Melalite Cream | Hydroquinone
Wokadine Solution | Povidone Iodine
Lox 2% Jelly | Lidocaine
Dettol Antiseptic Liquid | Chloroxylenol
Savlon Antiseptic Liquid | Chlorhexidine + Cetrimide
Vicks Inhaler
Halls
Pyrigesic 650 | Paracetamol
Hicet 10 | Cetirizine
Lecope 5 | Levocetirizine
Lecope M | Levocetirizine + Montelukast
Monticope | Montelukast + Levocetirizine
Levosiz M | Levocetirizine + Montelukast
Coldarin
Solvin Cold
Mucodyne | Carbocisteine
Livoluk | Lactulose
Vibact | Probiotic
Prolyte ORS | Oral Rehydration Salts
Walyte ORS | Oral Rehydration Salts
Pedialyte | Electrolytes
HealthOK | Multivitamin
Seven Seas | Cod Liver Oil
Fourts B | Vitamin B Complex
Chymoral Forte | Trypsin + Chymotrypsin
Enzoflam | Diclofenac + Paracetamol + Serratiopeptidase
Loprin 75 | Aspirin
Ecosprin Gold 10 | Aspirin + Atorvastatin + Clopidogrel
Clopivas 75 | Clopidogrel
Revelol XL 25 | Metoprolol
Telpres 40 | Telmisartan
Nodon 5 | Nebivolol
Corbis 5 | Bisoprolol
Dianorm 80 | Gliclazide
Syscan 150 | Fluconazole
Ovral G | Norgestrel + Ethinylestradiol
Septran Suspension | Cotrimoxazole
Dulcolax Suppository | Bisacodyl
Glycerin Suppository | Glycerin
Proctosedyl Ointment | Hydrocortisone + Cinchocaine
Anovate Cream | Beclomethasone + Phenylephrine + Lidocaine
Faktu Ointment
Metrogyl DG Gel | Metronidazole + Chlorhexidine
Sitopaladi Churna
Avipattikar Churna
Hingvastak Churna
Arogyavardhini Vati
Chandraprabha Vati
Yogaraj Guggulu
Kaishore Guggulu
Mahanarayan Tail
Trikatu Churna

Keytruda | Pembrolizumab
Opdivo | Nivolumab
Yervoy | Ipilimumab
Tecentriq | Atezolizumab
Imfinzi | Durvalumab
Bavencio | Avelumab
Herceptin | Trastuzumab
Herceptin SC | Trastuzumab
Perjeta | Pertuzumab
Phesgo | Pertuzumab + Trastuzumab
Kadcyla | Trastuzumab Emtansine
Enhertu | Trastuzumab Deruxtecan
Avastin | Bevacizumab
MabThera | Rituximab
Gazyva | Obinutuzumab
Darzalex | Daratumumab
Darzalex SC | Daratumumab
Erbitux | Cetuximab
Vectibix | Panitumumab
Blincyto | Blinatumomab
Adcetris | Brentuximab Vedotin
Velcade | Bortezomib
Kyprolis | Carfilzomib
Revlimid | Lenalidomide
Imnovid | Pomalidomide
Tagrisso 80 | Osimertinib
Iressa 250 | Gefitinib
Tarceva 150 | Erlotinib
Giotrif | Afatinib
Alecensa | Alectinib
Xalkori | Crizotinib
Lorbrena | Lorlatinib
Ibrance 125 | Palbociclib
Kisqali | Ribociclib
Verzenio | Abemaciclib
Lynparza | Olaparib
Zejula | Niraparib
Xtandi | Enzalutamide
Zytiga | Abiraterone
Erleada | Apalutamide
Nubeqa | Darolutamide
Imbruvica | Ibrutinib
Calquence | Acalabrutinib
Brukinsa | Zanubrutinib
Glivec 400 | Imatinib
Tasigna | Nilotinib
Sprycel | Dasatinib
Jakavi | Ruxolitinib
Nexavar | Sorafenib
Sutent | Sunitinib
Votrient | Pazopanib
Inlyta | Axitinib
Cabometyx | Cabozantinib
Lenvima | Lenvatinib
Stivarga | Regorafenib
Tykerb | Lapatinib
Afinitor | Everolimus
Faslodex | Fulvestrant
Zoladex | Goserelin
Eligard | Leuprolide
Firmagon | Degarelix
Temodal | Temozolomide
Alimta | Pemetrexed
Taxotere | Docetaxel
Abraxane | Paclitaxel (protein-bound)
Halaven | Eribulin
Xgeva | Denosumab
Prolia | Denosumab
Neulasta | Pegfilgrastim
Emend | Aprepitant
Akynzeo | Netupitant + Palonosetron

Humira | Adalimumab
Enbrel | Etanercept
Remicade | Infliximab
Simponi | Golimumab
Cimzia | Certolizumab Pegol
Actemra | Tocilizumab
Orencia | Abatacept
Stelara | Ustekinumab
Cosentyx | Secukinumab
Taltz | Ixekizumab
Tremfya | Guselkumab
Skyrizi | Risankizumab
Entyvio | Vedolizumab
Dupixent | Dupilumab
Xolair | Omalizumab
Nucala | Mepolizumab
Fasenra | Benralizumab
Xeljanz | Tofacitinib
Olumiant | Baricitinib
Rinvoq | Upadacitinib
Benlysta | Belimumab
Otezla | Apremilast

Ocrevus | Ocrelizumab
Tysabri | Natalizumab
Gilenya | Fingolimod
Aubagio | Teriflunomide
Tecfidera | Dimethyl Fumarate
Mavenclad | Cladribine
Kesimpta | Ofatumumab
Spinraza | Nusinersen
Zolgensma | Onasemnogene Abeparvovec
Evrysdi | Risdiplam
Aimovig | Erenumab
Ajovy | Fremanezumab
Emgality | Galcanezumab
Botox | Botulinum Toxin Type A
Dysport | Botulinum Toxin Type A
Vimpat | Lacosamide
Briviact | Brivaracetam
Fycompa | Perampanel
Xenazine | Tetrabenazine
Aricept | Donepezil

Soliris | Eculizumab
Ultomiris | Ravulizumab
Hemlibra | Emicizumab
Advate | Factor VIII (Octocog Alfa)
NovoSeven | Factor VIIa (Eptacog Alfa)
Cerezyme | Imiglucerase
Fabrazyme | Agalsidase Beta
Myozyme | Alglucosidase Alfa
Aldurazyme | Laronidase
Elaprase | Idursulfase
Exjade | Deferasirox
Jadenu | Deferasirox
Revolade | Eltrombopag
Nplate | Romiplostim

Prograf | Tacrolimus
Advagraf | Tacrolimus (extended release)
CellCept | Mycophenolate Mofetil
Myfortic | Mycophenolate Sodium
Sandimmun Neoral | Ciclosporin
Certican | Everolimus
Rapamune | Sirolimus
Simulect | Basiliximab
Thymoglobulin | Anti-thymocyte Globulin

Tivicay | Dolutegravir
Triumeq | Dolutegravir + Abacavir + Lamivudine
Isentress | Raltegravir
Sovaldi | Sofosbuvir
Harvoni | Ledipasvir + Sofosbuvir
Epclusa | Sofosbuvir + Velpatasvir
Vemlidy | Tenofovir Alafenamide
Paxlovid | Nirmatrelvir + Ritonavir
Veklury | Remdesivir
Cresemba | Isavuconazole
Noxafil | Posaconazole
Cancidas | Caspofungin
Mycamine | Micafungin
AmBisome | Amphotericin B (liposomal)
Zavicefta | Ceftazidime + Avibactam
Tygacil | Tigecycline
Zyvox | Linezolid
Meronem | Meropenem
Invanz | Ertapenem
Sirturo | Bedaquiline
Deltyba | Delamanid
Synagis | Palivizumab

Repatha | Evolocumab
Praluent | Alirocumab
Leqvio | Inclisiran
Multaq | Dronedarone
Ranexa | Ranolazine
Uptravi | Selexipag
Opsumit | Macitentan
Tracleer | Bosentan
Revatio | Sildenafil
Vyndaqel | Tafamidis
Lixiana | Edoxaban
Kerendia | Finerenone
Verquvo | Vericiguat
Xultophy | Insulin Degludec + Liraglutide
Soliqua | Insulin Glargine + Lixisenatide
Fiasp | Insulin Aspart (fast-acting)
Humulin R | Human Insulin (regular)
Humulin 30/70 | Human Insulin (premixed)
Mixtard 30 | Human Insulin (premixed)
Saxenda | Liraglutide
Byetta | Exenatide

Spiriva | Tiotropium
Spiriva Respimat | Tiotropium
Seretide Accuhaler | Salmeterol + Fluticasone
Symbicort Turbuhaler | Budesonide + Formoterol
Trelegy Ellipta | Fluticasone + Umeclidinium + Vilanterol
Anoro Ellipta | Umeclidinium + Vilanterol
Relvar Ellipta | Fluticasone + Vilanterol
Ultibro Breezhaler | Indacaterol + Glycopyrronium
Onbrez Breezhaler | Indacaterol
Ofev | Nintedanib
Esbriet | Pirfenidone

Lucentis | Ranibizumab
Eylea | Aflibercept
Beovu | Brolucizumab
Vabysmo | Faricimab
Ozurdex | Dexamethasone (eye implant)
Restasis | Ciclosporin (eye drops)
Lumigan | Bimatoprost
Xalatan | Latanoprost
Travatan | Travoprost
Combigan | Brimonidine + Timolol
Ganfort | Bimatoprost + Timolol

Evenity | Romosozumab
Aclasta | Zoledronic Acid
Genotropin | Somatropin
Norditropin | Somatropin
Omnitrope | Somatropin
Sandostatin LAR | Octreotide
Somatuline | Lanreotide
Gonal-f | Follitropin Alfa
Ovidrel | Choriogonadotropin Alfa
Cetrotide | Cetrorelix
Mirena | Levonorgestrel (IUD)
Premarin | Conjugated Estrogens
Champix | Varenicline
Nicorette | Nicotine

Abilify Maintena | Aripiprazole (injection)
Invega Sustenna | Paliperidone (injection)
Spravato | Esketamine
Strattera | Atomoxetine
Concerta | Methylphenidate
Rexulti | Brexpiprazole
Latuda | Lurasidone
Seroquel | Quetiapine
Zyprexa | Olanzapine
Risperdal | Risperidone
Cipralex | Escitalopram
Pristiq | Desvenlafaxine
Valdoxan | Agomelatine
Cymbalta | Duloxetine
Lyrica | Pregabalin

Ocaliva | Obeticholic Acid
Movicol | Macrogol
Entocort | Budesonide
Pentasa | Mesalamine
Vesicare | Solifenacin
Betmiga | Mirabegron
Cialis | Tadalafil
Viagra | Sildenafil
Avodart | Dutasteride
`;

// Generic (salt) names, for when the nurse knows the medicine by what's in it.
const GENERICS = `
Paracetamol
Ibuprofen
Diclofenac
Aceclofenac
Naproxen
Mefenamic Acid
Ketorolac
Etoricoxib
Celecoxib
Nimesulide
Piroxicam
Meloxicam
Lornoxicam
Indomethacin
Etodolac
Ketoprofen
Flurbiprofen
Dexketoprofen
Tramadol
Tapentadol
Morphine
Fentanyl
Buprenorphine
Pentazocine
Aspirin
Serratiopeptidase
Thiocolchicoside
Chlorzoxazone
Tizanidine
Baclofen
Methocarbamol
Eperisone
Colchicine
Allopurinol
Febuxostat
Pregabalin
Gabapentin
Duloxetine
Amitriptyline
Nortriptyline
Amoxicillin
Amoxicillin + Clavulanic Acid
Ampicillin
Cloxacillin
Penicillin V
Benzathine Penicillin
Piperacillin + Tazobactam
Cefalexin
Cefadroxil
Cefuroxime
Cefixime
Cefpodoxime
Cefdinir
Ceftriaxone
Cefotaxime
Ceftazidime
Cefoperazone + Sulbactam
Cefepime
Azithromycin
Clarithromycin
Erythromycin
Roxithromycin
Doxycycline
Minocycline
Tetracycline
Ciprofloxacin
Ofloxacin
Levofloxacin
Moxifloxacin
Norfloxacin
Prulifloxacin
Faropenem
Meropenem
Imipenem + Cilastatin
Ertapenem
Gentamicin
Amikacin
Tobramycin
Vancomycin
Teicoplanin
Linezolid
Clindamycin
Metronidazole
Tinidazole
Ornidazole
Secnidazole
Nitrofurantoin
Fosfomycin
Cotrimoxazole
Colistin
Polymyxin B
Tigecycline
Rifaximin
Chloramphenicol
Fusidic Acid
Mupirocin
Isoniazid
Rifampicin
Pyrazinamide
Ethambutol
Streptomycin
Bedaquiline
Acyclovir
Valacyclovir
Famciclovir
Oseltamivir
Favipiravir
Remdesivir
Tenofovir
Entecavir
Lamivudine
Zidovudine
Dolutegravir
Efavirenz
Sofosbuvir
Velpatasvir
Ganciclovir
Valganciclovir
Fluconazole
Itraconazole
Voriconazole
Posaconazole
Ketoconazole
Clotrimazole
Miconazole
Terbinafine
Griseofulvin
Amphotericin B
Nystatin
Luliconazole
Sertaconazole
Amorolfine
Caspofungin
Albendazole
Mebendazole
Ivermectin
Praziquantel
Pyrantel Pamoate
Diethylcarbamazine
Nitazoxanide
Chloroquine
Hydroxychloroquine
Artesunate
Artemether + Lumefantrine
Primaquine
Quinine
Permethrin
Pantoprazole
Omeprazole
Esomeprazole
Rabeprazole
Lansoprazole
Vonoprazan
Ranitidine
Famotidine
Domperidone
Ondansetron
Granisetron
Metoclopramide
Itopride
Levosulpiride
Prochlorperazine
Sucralfate
Antacid
Simethicone
Lactulose
Bisacodyl
Senna
Ispaghula Husk
Polyethylene Glycol
Sodium Picosulfate
Liquid Paraffin
Loperamide
Racecadotril
Oral Rehydration Salts
Zinc Sulphate
Dicyclomine
Hyoscine Butylbromide
Drotaverine
Mebeverine
Ursodeoxycholic Acid
Mesalamine
Sulfasalazine
Pancreatin
Saccharomyces boulardii
Bacillus clausii
Lactobacillus
Silymarin
L-Ornithine L-Aspartate
Amlodipine
Cilnidipine
Nifedipine
Felodipine
Diltiazem
Verapamil
Atenolol
Metoprolol
Bisoprolol
Nebivolol
Carvedilol
Propranolol
Labetalol
Telmisartan
Losartan
Olmesartan
Valsartan
Irbesartan
Candesartan
Azilsartan
Ramipril
Enalapril
Lisinopril
Perindopril
Captopril
Hydrochlorothiazide
Chlorthalidone
Indapamide
Furosemide
Torsemide
Spironolactone
Eplerenone
Metolazone
Clonidine
Prazosin
Methyldopa
Hydralazine
Sacubitril + Valsartan
Ivabradine
Digoxin
Amiodarone
Ranolazine
Trimetazidine
Nicorandil
Isosorbide Mononitrate
Isosorbide Dinitrate
Nitroglycerin
Atorvastatin
Rosuvastatin
Simvastatin
Pravastatin
Fenofibrate
Ezetimibe
Clopidogrel
Prasugrel
Ticagrelor
Warfarin
Acenocoumarol
Apixaban
Rivaroxaban
Dabigatran
Heparin
Enoxaparin
Fondaparinux
Cilostazol
Pentoxifylline
Dobutamine
Dopamine
Noradrenaline
Adrenaline
Tranexamic Acid
Ethamsylate
Vitamin K
Metformin
Glimepiride
Gliclazide
Glipizide
Glibenclamide
Sitagliptin
Vildagliptin
Teneligliptin
Linagliptin
Saxagliptin
Dapagliflozin
Empagliflozin
Canagliflozin
Remogliflozin
Pioglitazone
Voglibose
Acarbose
Repaglinide
Semaglutide
Tirzepatide
Liraglutide
Dulaglutide
Insulin Regular
Insulin NPH
Insulin Glargine
Insulin Degludec
Insulin Aspart
Insulin Lispro
Insulin Detemir
Insulin Glulisine
Levothyroxine
Carbimazole
Methimazole
Propylthiouracil
Prednisolone
Methylprednisolone
Dexamethasone
Hydrocortisone
Betamethasone
Deflazacort
Fludrocortisone
Budesonide
Testosterone
Progesterone
Dydrogesterone
Estradiol
Medroxyprogesterone
Norethisterone
Clomiphene
Letrozole
Cabergoline
Bromocriptine
Alendronate
Risedronate
Zoledronic Acid
Calcitriol
Cholecalciferol
Teriparatide
Desmopressin
Salbutamol
Levosalbutamol
Terbutaline
Ipratropium
Tiotropium
Glycopyrronium
Formoterol
Salmeterol
Fluticasone
Beclomethasone
Ciclesonide
Mometasone
Montelukast
Theophylline
Doxofylline
Acebrophylline
Roflumilast
Ambroxol
Bromhexine
Guaifenesin
N-Acetylcysteine
Dextromethorphan
Codeine
Levocetirizine
Cetirizine
Fexofenadine
Loratadine
Desloratadine
Bilastine
Rupatadine
Olopatadine
Chlorpheniramine
Diphenhydramine
Hydroxyzine
Promethazine
Pheniramine
Cyproheptadine
Phenylephrine
Xylometazoline
Oxymetazoline
Azelastine
Phenytoin
Carbamazepine
Oxcarbazepine
Sodium Valproate
Divalproex
Levetiracetam
Brivaracetam
Lacosamide
Lamotrigine
Topiramate
Zonisamide
Clobazam
Clonazepam
Lorazepam
Diazepam
Alprazolam
Midazolam
Etizolam
Phenobarbital
Donepezil
Memantine
Rivastigmine
Levodopa + Carbidopa
Pramipexole
Ropinirole
Rasagiline
Trihexyphenidyl
Amantadine
Sumatriptan
Rizatriptan
Flunarizine
Cinnarizine
Betahistine
Citicoline
Piracetam
Nimodipine
Pyridostigmine
Sertraline
Escitalopram
Fluoxetine
Paroxetine
Fluvoxamine
Venlafaxine
Desvenlafaxine
Mirtazapine
Bupropion
Trazodone
Vortioxetine
Imipramine
Clomipramine
Dosulepin
Olanzapine
Risperidone
Quetiapine
Aripiprazole
Haloperidol
Clozapine
Paliperidone
Amisulpride
Lurasidone
Chlorpromazine
Trifluoperazine
Lithium
Zolpidem
Melatonin
Methylphenidate
Atomoxetine
Naltrexone
Disulfiram
Acamprosate
Tamsulosin
Silodosin
Alfuzosin
Dutasteride
Finasteride
Solifenacin
Tolterodine
Oxybutynin
Mirabegron
Sildenafil
Tadalafil
Potassium Citrate
Sodium Bicarbonate
Sevelamer
Calcium Acetate
Cinacalcet
Erythropoietin
Vitamin B Complex
Methylcobalamin
Cyanocobalamin
Folic Acid
Ferrous Sulphate
Ferrous Ascorbate
Iron Sucrose
Ferric Carboxymaltose
Calcium Carbonate
Calcium + Vitamin D3
Vitamin C
Vitamin E
Vitamin A
Vitamin D3
Thiamine
Pyridoxine
Riboflavin
Multivitamin
Zinc
Magnesium
Potassium Chloride
Omega-3 Fatty Acids
Biotin
L-Carnitine
Coenzyme Q10
Alpha Lipoic Acid
Methotrexate
Azathioprine
Mycophenolate Mofetil
Tacrolimus
Cyclosporine
Leflunomide
Tofacitinib
Cyclophosphamide
Tamoxifen
Anastrozole
Imatinib
Capecitabine
Hydroxyurea
Bicalutamide
Abiraterone
Carboxymethylcellulose
Timolol
Latanoprost
Brimonidine
Dorzolamide
Prednisolone Acetate
Povidone Iodine
Silver Sulfadiazine
Calamine
Clobetasol
Adapalene
Benzoyl Peroxide
Tretinoin
Minoxidil
Lidocaine
Chlorhexidine
Petroleum Jelly
Urea
Normal Saline
Ringer Lactate
Dextrose
Mannitol
Human Albumin
Atropine
Glycopyrrolate
Neostigmine
Naloxone
Activated Charcoal
Magnesium Sulphate
Calcium Gluconate
Oxytocin
Misoprostol
Mifepristone
Methylergometrine
Nicotine
Varenicline
Orlistat
Ashwagandha
Triphala
Giloy
Glucosamine
Carbocisteine
Ebastine
Dienogest
Gatifloxacin
Loteprednol
Fluorometholone
Bimatoprost
Travoprost
Brinzolamide
Cyclopentolate
Tropicamide
Natamycin
Nepafenac
Ketotifen
Sodium Hyaluronate
Propylene Glycol
Dimenhydrinate
Doxylamine + Pyridoxine
Nadifloxacin
Hydroquinone
Selenium Sulphide
Glycerin

Paracetamol 500
Paracetamol 650
Ibuprofen 400
Diclofenac 50
Aceclofenac 100
Tramadol 50
Metformin 500
Metformin 1000
Glimepiride 1
Glimepiride 2
Amlodipine 5
Telmisartan 40
Losartan 50
Atenolol 50
Metoprolol 25
Carvedilol 6.25
Atorvastatin 10
Atorvastatin 20
Rosuvastatin 10
Aspirin 75
Clopidogrel 75
Warfarin 5
Digoxin 0.25
Furosemide 40
Torsemide 10
Spironolactone 25
Pantoprazole 40
Omeprazole 20
Rabeprazole 20
Ranitidine 150
Domperidone 10
Ondansetron 4
Ondansetron 8
Cetirizine 10
Levocetirizine 5
Montelukast 10
Salbutamol 4
Azithromycin 500
Amoxicillin 500
Cefixime 200
Ciprofloxacin 500
Levofloxacin 500
Metronidazole 400
Doxycycline 100
Fluconazole 150
Albendazole 400
Ivermectin 12
Hydroxychloroquine 200
Levothyroxine 50
Prednisolone 10
Dexamethasone 4
Folic Acid 5
Vitamin D3 60000 IU
Calcium 500
Methylcobalamin 1500
Pregabalin 75
Gabapentin 300
Alprazolam 0.25
Clonazepam 0.5
Escitalopram 10
Sertraline 50
Amitriptyline 10
Tamsulosin 0.4
Sildenafil 50
Allopurinol 100
Febuxostat 40

Paracetamol Syrup
Paracetamol Drops
Paracetamol Suppository
Ibuprofen Syrup
Cetirizine Syrup
Ondansetron Syrup
Amoxicillin Syrup
Azithromycin Syrup
Cefixime Syrup
Salbutamol Syrup
Lactulose Syrup
Iron Syrup
Multivitamin Syrup
Multivitamin Drops
Calcium Syrup
Zinc Syrup
Antacid Syrup
Cough Syrup
Vitamin D3 Drops
Saline Nasal Drops
Lubricant Eye Drops
Antibiotic Eye Drops
Ear Wax Drops

Pembrolizumab
Nivolumab
Ipilimumab
Atezolizumab
Durvalumab
Avelumab
Trastuzumab
Pertuzumab
Trastuzumab Emtansine
Trastuzumab Deruxtecan
Bevacizumab
Rituximab
Obinutuzumab
Daratumumab
Cetuximab
Panitumumab
Blinatumomab
Brentuximab Vedotin
Bortezomib
Carfilzomib
Lenalidomide
Pomalidomide
Osimertinib
Gefitinib
Erlotinib
Afatinib
Alectinib
Crizotinib
Lorlatinib
Palbociclib
Ribociclib
Abemaciclib
Olaparib
Niraparib
Enzalutamide
Apalutamide
Darolutamide
Ibrutinib
Acalabrutinib
Zanubrutinib
Nilotinib
Dasatinib
Ruxolitinib
Sorafenib
Sunitinib
Pazopanib
Axitinib
Cabozantinib
Lenvatinib
Regorafenib
Lapatinib
Everolimus
Fulvestrant
Goserelin
Leuprolide
Degarelix
Temozolomide
Pemetrexed
Docetaxel
Eribulin
Denosumab
Pegfilgrastim
Aprepitant
Netupitant
Palonosetron
Adalimumab
Etanercept
Infliximab
Golimumab
Certolizumab Pegol
Tocilizumab
Abatacept
Ustekinumab
Secukinumab
Ixekizumab
Guselkumab
Risankizumab
Vedolizumab
Dupilumab
Omalizumab
Mepolizumab
Benralizumab
Baricitinib
Upadacitinib
Belimumab
Apremilast
Ocrelizumab
Natalizumab
Fingolimod
Teriflunomide
Dimethyl Fumarate
Cladribine
Ofatumumab
Nusinersen
Onasemnogene Abeparvovec
Risdiplam
Erenumab
Fremanezumab
Galcanezumab
Botulinum Toxin Type A
Perampanel
Tetrabenazine
Eculizumab
Ravulizumab
Emicizumab
Imiglucerase
Agalsidase Beta
Alglucosidase Alfa
Laronidase
Idursulfase
Deferasirox
Eltrombopag
Romiplostim
Mycophenolate Sodium
Ciclosporin
Sirolimus
Basiliximab
Anti-thymocyte Globulin
Abacavir
Raltegravir
Ledipasvir
Tenofovir Alafenamide
Nirmatrelvir
Ritonavir
Isavuconazole
Micafungin
Avibactam
Delamanid
Palivizumab
Evolocumab
Alirocumab
Inclisiran
Dronedarone
Selexipag
Macitentan
Bosentan
Tafamidis
Edoxaban
Finerenone
Vericiguat
Lixisenatide
Exenatide
Umeclidinium
Vilanterol
Indacaterol
Nintedanib
Pirfenidone
Ranibizumab
Aflibercept
Brolucizumab
Faricimab
Romosozumab
Somatropin
Octreotide
Lanreotide
Follitropin Alfa
Choriogonadotropin Alfa
Cetrorelix
Conjugated Estrogens
Esketamine
Brexpiprazole
Agomelatine
Obeticholic Acid
Macrogol
`;

// Blank lines just group related names. Repeats and names over 40 characters (too long for
// the name box) are caught by the tests in tests/app.spec.js, not filtered out here.
function parse(text) {
  return text.split("\n").filter((line) => line.trim()).map((line) => {
    const [name, generic = ""] = line.split("|").map((s) => s.trim());
    return { name, generic };
  });
}

export const MEDICINES = [...parse(BRANDS), ...parse(GENERICS)];
