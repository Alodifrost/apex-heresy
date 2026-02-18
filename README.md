# Apex Heresy

**An Unofficial Foundry VTT System for Dark Heresy 2nd Edition, Black Crusade, and Only War**

---

## Important Notice & Project Support

**Project Distribution & Support**: This system is distributed through Boosty (a Patreon equivalent) by the author for a nominal contribution. This support is essential for the continued development, maintenance, and creation of compendiums and modules for this project. 

While you are free to share this system with your colleagues and gaming groups, I earnestly request that you support the project in some way. Your support enables the continued development of modules, compendiums, and additional content for this system, as I am committed to reviving the classic FFG systems on Foundry VTT with modern implementations.

**Future Plans**: In addition to continuing work on Dark Heresy, Black Crusade, and Only War systems, I plan to create a modern, fully automated system for D&D 3.5 Edition. Your support helps make these ambitious projects possible.

**Foundry Version Compatibility**: This system is currently built for Foundry VTT version 12. This decision was made because the majority of existing game worlds, custom compendiums, and player-created content are built for Foundry 12. By maintaining compatibility with version 12, players can easily migrate their existing game worlds to this new system with its advanced design and automation features. A release for Foundry VTT version 13 is planned for the near future.

**Thank you for your understanding and support!**

---

## What Apex Heresy Provides

Apex Heresy is a comprehensive Foundry VTT system that implements extensive automation and quality-of-life improvements for Dark Heresy 2nd Edition, Black Crusade, and Only War. The system focuses on reducing bookkeeping, automating calculations, and streamlining gameplay while maintaining full flexibility for custom scenarios.

---

## Automation & Quality of Life Features

### **Comprehensive Combat Automation**

- **Automatic Attack Resolution**: All attack rolls, hit location determination, and success/failure calculations are handled automatically
- **Automatic Damage Application**: Damage is calculated, applied to targets, and tracked automatically, including armor penetration and location-based protection
- **Automatic Range Detection**: Weapon range modifiers are automatically calculated based on the distance between tokens on the game board (Point Blank, Short, Long, Extreme ranges)
- **Automatic Rate of Fire**: The system automatically determines available attack modes (Single, Semi-Auto, Full-Auto, Wide-Auto) based on weapon capabilities and calculates required ammunition
- **Automatic Size Modifiers**: Target size modifiers are automatically applied to ranged attacks
- **BLAST Grenade Automation**: Explosive weapons with BLAST properties automatically calculate area damage, apply damage to multiple targets in the blast radius, and handle mass evasion rolls
- **Automatic Ammunition Consumption**: The system tracks and deducts ammunition based on attack type and rate of fire automatically
- **Weapon Trait Automation**: Special weapon traits (Tearing, Proven, Primitive, Force, Devastating, etc.) are automatically applied to damage rolls and combat calculations
- **Automatic Weapon Jams & Overheating**: The system tracks weapon reliability and automatically handles jams and overheating based on weapon properties

### **Dynamic Character Modification**

- **Quick Temporary Modifiers**: Characteristics and armor values can be modified dynamically using temporary modifier fields that update calculations instantly
- **Real-Time Armor Adjustment**: Armor values per body location can be adjusted on-the-fly with temporary modifiers, perfect for cover, environmental effects, or temporary equipment
- **Instant Characteristic Updates**: Temporary modifiers to characteristics (Weapon Skill, Ballistic Skill, Strength, etc.) immediately affect all derived calculations including skills, movement, and combat values
- **Automatic Recalculation**: All derived statistics (skill totals, movement rates, armor totals) automatically recalculate when base values or temporary modifiers change

### **Automatic Fatigue System**

- **Automatic Fatigue Penalties**: When fatigue is active, all characteristics automatically receive a -10 penalty
- **Real-Time Effect Application**: Fatigue penalties are applied instantly and affect all characteristic-based calculations including skills, movement, and combat modifiers
- **Automatic Fatigue Application**: Fatigue can be automatically applied from various sources (Shock weapons, On Fire condition, etc.) and penalties are immediately reflected

### **Automated Condition Effects**

The system includes fully automated condition effects that trigger automatically during combat:

- **On Fire**: Automatically applies 1d10 energy damage (ignoring armor) and 1 level of Fatigue at the start of each turn, plus triggers an automatic Willpower test
- **Bleeding**: Automatically applies damage at the start of each turn based on the severity of the bleeding condition
- **Stunned**: Automatically modifies combat capabilities and prevents certain actions
- **Blinded**: Automatically fails ranged attacks for blinded characters
- **Prone**: Automatically applies appropriate combat modifiers
- **Grappled**: Automatically restricts movement and actions
- **Poisoned**: Automatically applies damage and effects based on poison severity
- **And More**: The system supports all standard conditions with automatic effect application

All condition effects integrate seamlessly with Foundry VTT's Active Effects system, ensuring modifiers are applied correctly and automatically removed when conditions end.

### **Advanced Horde System Automation**

- **Automatic Horde Size Tracking**: Horde size is automatically reduced when damage is dealt, with proper calculation of kills based on damage type and weapon traits
- **Automatic Horde Attack Bonuses**: Attack bonuses against hordes are automatically calculated based on horde size (ranging from +30 to +60)
- **Automatic Horde Damage Bonus Dice**: Additional damage dice against hordes are automatically added based on horde size
- **Automatic Horde Kill Calculations**: The system automatically calculates kills against hordes based on Degrees of Success, weapon class, and special traits like Devastating
- **Mass Combat Simplification**: Horde mechanics dramatically simplify running large-scale battles, making epic encounters manageable without losing tactical depth

### **Character System Automation**

- **Automatic Characteristic Calculations**: All characteristics are automatically calculated from base values, advances, temporary modifiers, and fatigue penalties
- **Automatic Skill Calculations**: Skills automatically calculate their values from characteristics, advances, and specializations
- **Automatic Movement Calculation**: Movement rates are automatically calculated from Agility bonus and size modifiers
- **Automatic Armor Calculations**: Armor values are automatically calculated per body location, including toughness bonuses and penetration reductions
- **Automatic Experience Cost Calculation**: Experience point costs for advances are automatically calculated based on aptitudes and current advancement levels

### **Combat Modifier Automation**

- **Automatic Condition Effects**: Conditions automatically modify combat rolls and capabilities without manual intervention
- **Automatic Aiming Bonuses**: Aiming bonuses are automatically applied when characters take aim actions
- **Automatic Evasion Calculations**: Evasion rolls automatically calculate success/failure and degrees of success
- **Automatic Critical Hit Resolution**: Critical hits automatically trigger appropriate effects and damage calculations
- **Automatic Righteous Fury**: Righteous Fury rolls are automatically handled and applied to damage

### **Psychic Power Automation**

- **Automatic Focus Power Tests**: Focus power tests are automatically calculated with proper difficulty modifiers
- **Automatic Sustained Power Tracking**: Sustained powers are automatically tracked and their effects maintained
- **Automatic Psy Rating Applications**: Psy Rating bonuses are automatically applied to psychic power tests and damage

### **Active Effects Integration**

The system fully integrates with Foundry VTT's Active Effects system, allowing you to:
- Automatically apply bonuses and penalties from talents, traits, equipment, and conditions
- Modify any actor or item attribute through effects
- Create custom effects that automatically modify characteristics, skills, armor, and more
- Stack multiple effects with proper priority handling

---

## Key Features Summary

✨ **Automated Calculations**: Characteristics, skills, damage, armor, and all derived statistics are calculated automatically

🎯 **Comprehensive Combat Automation**: Automatic attack resolution, damage application, range detection, rate of fire determination, size modifiers, BLAST grenades, and weapon trait application

⚡ **Dynamic Modifications**: Quick temporary modifiers for characteristics and armor that update all calculations instantly

🔥 **Automated Condition Effects**: On Fire, Bleeding, Stunned, and other conditions automatically apply their effects during combat

💪 **Automatic Fatigue System**: Fatigue penalties automatically apply to all characteristics and affect all derived calculations

👥 **Advanced Horde System**: Fully automated horde mechanics that simplify mass combat with automatic size tracking, bonuses, and kill calculations

📊 **Real-Time Updates**: All calculations update instantly when values change, ensuring accuracy without manual recalculation

🎲 **Comprehensive Dice Rolling**: Built-in support for all roll types with proper difficulty modifiers and automatic success/failure determination

---

## System Requirements

- **Foundry VTT**: Version 12 or higher
- **Core Version**: Minimum Core Version 11, Verified for Core Version 12

---

## Multi-Game Support

Apex Heresy is designed to support Dark Heresy 2nd Edition, Black Crusade, and Only War campaigns. The system's flexible architecture allows Game Masters to adapt the ruleset to their preferred game variant while maintaining full compatibility with the core mechanics and automation features.

---

## Credits

Developed by the Apex team for the Foundry VTT community.

*This is an unofficial system for Dark Heresy 2nd Edition, Black Crusade, and Only War. This system is not affiliated with Games Workshop or Fantasy Flight Games.*

---

## Support & Feedback

Found an issue or have a suggestion? The system is actively maintained and improved based on community feedback. Your input helps make Apex Heresy better for everyone.
