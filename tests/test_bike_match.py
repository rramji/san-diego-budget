from pipeline.bike_match import is_bike_project, is_road_repair


def test_is_bike_project_matches_and_excludes_motorcycle():
    for name in ["Minor Bike Facilities", "Park Blvd Bicycle Facility", "Bayshore Bikeway",
                 "Downtown Cycle Track", "Active Transportation Corridor", "PEDESTRIAN Bridge",
                 "University Ave Bikeway Pavement Repair"]:
        assert is_bike_project(name), name
    for name in ["Motorcycle Unit Facility", "Police Motorcycle Bike Rack", "Resurfacing of City Streets",
                 "Sewer Main Replacements", ""]:
        assert not is_bike_project(name), name


def test_is_road_repair():
    for name in ["Street Resurfacing Program", "Slurry Seal Group 2025", "Pavement Rehab",
                 "Pothole Repair", "Street Repair Citywide", "Road Rehabilitation"]:
        assert is_road_repair(name), name
    for name in ["Sewer Main Replacements", "Traffic Signals - Citywide", "Park Improvements", ""]:
        assert not is_road_repair(name), name


def test_is_road_repair_matches_city_resurfacing_project_name():
    # The city's main repaving project is named "Resurfacing of City Streets", which the
    # phrase "street resurfacing" alone would miss.
    assert is_road_repair("Resurfacing of City Streets")


def test_is_road_repair_excludes_road_construction_improvements():
    # "X Road Improvements" projects (e.g. Otay Mesa widening) are new construction, not repair.
    assert not is_road_repair("Siempre Viva Road Improvements")
    assert not is_road_repair("Airway Road Improvements")


def test_is_road_repair_needs_whole_word_road():
    assert not is_road_repair("Broadway Streetscape")
    assert not is_road_repair("Railroad Crossing Study")
