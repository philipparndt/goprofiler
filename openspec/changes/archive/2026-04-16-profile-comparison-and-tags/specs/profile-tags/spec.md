## ADDED Requirements

### Requirement: Assign tags to profiles
The system SHALL allow users to assign one or more free-text tags to any profile. Tags are short strings (e.g., "baseline", "under-load", "v1.3").

#### Scenario: Add tag to profile
- **WHEN** user clicks "Add tag" on a profile and enters "baseline"
- **THEN** the tag "baseline" is saved and displayed as a badge on the profile

#### Scenario: Remove tag from profile
- **WHEN** user clicks the X on a tag badge
- **THEN** the tag is removed from the profile

#### Scenario: Auto-suggest existing tags
- **WHEN** user starts typing a tag
- **THEN** system suggests tags that have been used before (across all profiles)

### Requirement: Filter profiles by tag
The system SHALL allow filtering the profiles list by tag, in addition to the existing type filter.

#### Scenario: Filter by tag
- **WHEN** user selects tag "baseline" in the filter
- **THEN** only profiles tagged with "baseline" are shown

### Requirement: Tag at capture time
The system SHALL allow pre-setting a tag when starting a profile capture, so the tag is automatically applied to the result.

#### Scenario: Tag during capture
- **WHEN** user types "under-load" in the tag input before clicking Record/Capture
- **THEN** the resulting profile is automatically tagged with "under-load"
