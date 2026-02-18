class DarkHeresyActor extends Actor {

    async _preCreate(data, options, user) {

        let initData = {
            "prototypeToken.bar1": { attribute: "system.wounds", max: "max", value: "value" },
            "prototypeToken.bar2": { attribute: "system.fate", max: "max", value: "value" },
            "prototypeToken.name": data.name,
            "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER

        };
        if (data.type === "acolyte") {
            initData["prototypeToken.actorLink"] = true;
            initData["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        }
        // Set default icon if not provided
        if (!data.img && CONFIG.Actor.defaultIcons && CONFIG.Actor.defaultIcons[data.type]) {
            initData.img = CONFIG.Actor.defaultIcons[data.type];
        }
        this.updateSource(initData);
    }

    prepareData() {
        super.prepareData();
        this._computeCharacteristics();
        this._computeSkills();
        this._computeItems();
        this._computeExperience();
        this._computeArmour();
        this._computeMovement();
        this._prepareAttributesForModules();
    }

    /**
     * Prepare attributes.hp in standard Foundry VTT format for module compatibility (e.g., Health Estimate)
     * Health Estimate module expects hp.value to represent current damage/wounds, not remaining health
     * So we set value = currentWounds and max = maxWounds, and the module calculates health percentage correctly
     * 
     * This is safe - we only add/update hp, and only if wounds exist, without overwriting other attributes
     */
    _prepareAttributesForModules() {
        const wounds = this.system.wounds || {};
        const maxWounds = Number(wounds.max) || 0;
        const currentWounds = Number(wounds.value) || 0;
        
        // Always initialize attributes.hp for module compatibility
        // Initialize attributes if it doesn't exist (safe - won't overwrite existing data)
        if (!this.system.attributes) {
            this.system.attributes = {};
        }
        
        // Always set/update hp - preserve any other attributes that might exist from other modules
        // Set HP: value = current wounds (damage taken), max = max wounds
        // Module will calculate health as (max - value) / max, which gives correct percentage
        if (!this.system.attributes.hp) {
            this.system.attributes.hp = {};
        }
        this.system.attributes.hp.value = currentWounds;
        this.system.attributes.hp.max = maxWounds;
        if (this.system.attributes.hp.min === undefined) {
            this.system.attributes.hp.min = 0;
        }
    }

    _computeCharacteristics() {
        let middle = Object.values(this.characteristics).length / 2;
        let i = 0;
        for (let characteristic of Object.values(this.characteristics)) {
            const tempModifier = Number(characteristic.tempModifier) || 0;
            const baseTotal = characteristic.base + characteristic.advance;
            const fatiguePenalty = (Number(this.fatigue.value) || 0) > 0 ? 10 : 0;
            characteristic.total = Math.max(baseTotal - fatiguePenalty, 0);
            characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
            characteristic.displayTotal = characteristic.total + tempModifier;
            characteristic.displayBonus = Math.floor(characteristic.displayTotal / 10) + characteristic.unnatural;
            characteristic.isLeft = i < middle;
            characteristic.isRight = i >= middle;
            characteristic.advanceCharacteristic = this._getAdvanceCharacteristic(characteristic.advance);
            i++;
        }
        this.system.insanityBonus = Math.floor(this.insanity / 10);
        this.system.corruptionBonus = Math.floor(this.corruption / 10);
        // Initialize psy structure if it doesn't exist (for backward compatibility)
        // Structure is: system.psy.rating (flat, as used in createPsychicRollData)
        if (!this.system.psy) {
            this.system.psy = {
                rating: 0,
                sustained: 0,
                class: "bound",
                cost: 0,
                sustainedPowers: {
                    power1: "",
                    power2: "",
                    power3: "",
                    power4: "",
                    power5: "",
                    power6: "",
                    power7: ""
                }
            };
        }
        // Initialize sustainedPowers if it doesn't exist (for backward compatibility)
        if (!this.psy.sustainedPowers) {
            this.psy.sustainedPowers = {
                power1: "",
                power2: "",
                power3: "",
                power4: "",
                power5: "",
                power6: "",
                power7: ""
            };
        }
        // Ensure rating is initialized
        if (this.psy.rating === undefined || this.psy.rating === null) {
            this.psy.rating = 0;
        }
        
        // Calculate sustained powers count (non-empty sustained power fields)
        let sustainedPowersCount = 0;
        for (let key in this.psy.sustainedPowers) {
            if (this.psy.sustainedPowers[key] && this.psy.sustainedPowers[key].trim() !== "") {
                sustainedPowersCount++;
            }
        }
        // Current rating = base rating - sustained (old system) - sustained powers count (new system)
        this.psy.currentRating = this.psy.rating - this.psy.sustained - sustainedPowersCount;
        // Use displayBonus from STATS (the "source of truth") which includes tempModifier
        this.initiative.bonus = this.characteristics[this.initiative.characteristic].displayBonus || this.characteristics[this.initiative.characteristic].bonus;
        // Done as variables to make it easier to read & understand
        let tb = Math.floor(
            (this.characteristics.toughness.base
        + this.characteristics.toughness.advance) / 10);

        let wb = Math.floor(
            (this.characteristics.willpower.base
        + this.characteristics.willpower.advance) / 10);

        // The only thing not affected by itself
        this.fatigue.max = tb + wb;

    }

    _computeSkills() {
        for (let [skillKey, skill] of Object.entries(this.skills)) {
            let short = skill.characteristics[0];
            let characteristic = this._findCharacteristic(short);
            const baseTotal = characteristic.displayTotal ?? characteristic.total;
            // Ensure advance is a number (handle undefined, null, string, etc.)
            const advanceValue = Number(skill.advance) || 0;
            skill.total = baseTotal + advanceValue;
            
            // Apply -10 penalty to Parry if character has equipped weapon with Unbalanced trait
            if (skillKey === "parry" && this.items) {
                const equippedMeleeWeapon = this.items.find(item => {
                    return item.type === "weapon" 
                        && item.system?.equipped === true 
                        && (item.system?.class === "melee" || item.class === "melee");
                });
                
                if (equippedMeleeWeapon) {
                    const weaponSpecial = equippedMeleeWeapon.system?.special || equippedMeleeWeapon.special || "";
                    if (weaponSpecial) {
                        const weaponTraits = DarkHeresyUtil.extractWeaponTraits(weaponSpecial);
                        if (weaponTraits.unbalanced) {
                            skill.total -= 10;
                        }
                    }
                }
            }
            
            skill.advanceSkill = this._getAdvanceSkill(advanceValue);
            if (skill.isSpecialist) {
                // Get the skill key to find template data
                const skillKey = Object.keys(this.skills).find(key => this.skills[key] === skill);
                
                // Load template data to check for missing specialities
                const templateData = game.darkHeresy?.templateData || {};
                const templateSpecialities = templateData?.Actor?.templates?.skills?.skills?.[skillKey]?.specialities || {};
                
                // Add missing specialities from template and ensure label is preserved
                if (Object.keys(templateSpecialities).length > 0) {
                    for (let [specKey, specTemplate] of Object.entries(templateSpecialities)) {
                        if (!skill.specialities[specKey]) {
                            // Initialize missing speciality with template data
                            skill.specialities[specKey] = foundry.utils.deepClone(specTemplate);
                        } else {
                            // Ensure label exists (preserve existing or add from template)
                            if (!skill.specialities[specKey].label && specTemplate.label) {
                                skill.specialities[specKey].label = specTemplate.label;
                            }
                        }
                    }
                }
                
                // Fallback: Add new Common Lore specialities if template not loaded
                if (skillKey === "commonLore" && (!templateData || Object.keys(templateData).length === 0)) {
                    const newSpecialities = {
                        koronusExpanse: { label: "Koronus Expanse", advance: -20, starter: false, cost: 0 },
                        jerichoReach: { label: "Jericho Reach", advance: -20, starter: false, cost: 0 },
                        screamingVortex: { label: "Screaming Vortex", advance: -20, starter: false, cost: 0 },
                        calixisSector: { label: "Calixis Sector", advance: -20, starter: false, cost: 0 }
                    };
                    for (let [specKey, specData] of Object.entries(newSpecialities)) {
                        if (!skill.specialities[specKey]) {
                            skill.specialities[specKey] = foundry.utils.deepClone(specData);
                        } else {
                            // Ensure label exists
                            if (!skill.specialities[specKey].label) {
                                skill.specialities[specKey].label = specData.label;
                            }
                        }
                    }
                }
                
                for (let speciality of Object.values(skill.specialities)) {
                    // Use displayTotal from STATS (the "source of truth") which includes tempModifier
                    const baseTotal = characteristic.displayTotal ?? characteristic.total;
                    // Ensure advance is a number (handle undefined, null, string, etc.)
                    const advanceValue = Number(speciality.advance) || 0;
                    speciality.total = baseTotal + advanceValue;
                    speciality.advanceSpec = this._getAdvanceSkill(advanceValue);
                    
                    // Check if this speciality should be shown in the list
                    // Show if advance >= 0 (Known or higher), OR if advance = -20 (Untrained) and starter checkbox is checked
                    const isUntrained = advanceValue === -20;
                    const isKnownOrHigher = advanceValue >= 0;
                    const hasStarter = speciality.starter === true;
                    
                    if (isKnownOrHigher) {
                        // Known or higher - always show
                        speciality.isKnown = true;
                    } else if (isUntrained && hasStarter) {
                        // Untrained with starter checkbox checked - show it
                        speciality.isKnown = true;
                    } else {
                        // Not shown (Untrained without starter checkbox, or other negative values)
                        speciality.isKnown = false;
                    }
                }
            }
        }
    }

    _computeItems() {
        let encumbrance = 0;
        for (let item of this.items) {

            if (item.weight) {
                encumbrance = encumbrance + (item.quantity ? item.weightSum : item.weight);
            }
        }
        this._computeEncumbrance(encumbrance);
    }

    _computeExperience_auto() {
        let config = game.darkHeresy.config;
        let characterAptitudes = this.items.filter(it => it.isAptitude).map(it => it.name.trim());
        if (!characterAptitudes.includes("General")) characterAptitudes.push("General");
        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        if (this.experience.spentOther == null) this.experience.spentOther = 0;
        this.experience.spentPsychicPowers = 0;
        let psyRatingCost = Math.max(0, ((this.psy.rating * (this.psy.rating + 1) /2) - 1) * 200); // N*(n+1)/2 equals 1+2+3... -1 because we start paying from 2

        this.psy.cost = this.experience.spentPsychicPowers = psyRatingCost;
        for (let characteristic of Object.values(this.characteristics)) {
            let matchedAptitudes = characterAptitudes.filter(it => characteristic.aptitudes.includes(it)).length;
            let cost = 0;
            for (let i = 0; i <= characteristic.advance / 5 && i <= config.characteristicCosts.length; i++) {
                cost += config.characteristicCosts[i][2 - matchedAptitudes];
            }
            characteristic.cost = cost.toString();
            this.experience.spentCharacteristics += cost;
        }
        for (let skill of Object.values(this.skills)) {
            let matchedAptitudes = characterAptitudes.filter(it => skill.aptitudes.includes(it)).length;
            if (skill.isSpecialist) {
                for (let speciality of Object.values(skill.specialities)) {
                    let cost = 0;
                    for (let i = (speciality.starter ? 1 : 0); i <= speciality.advance / 10; i++) {
                        cost += (i + 1) * (3 - matchedAptitudes) * 100;
                    }
                    speciality.cost = cost;
                    this.experience.spentSkills += cost;
                }
            } else {
                let cost = 0;
                for (let i = (skill.starter ? 1 : 0); i <= skill.advance / 10; i++) {
                    cost += (i + 1) * (3 - matchedAptitudes) * 100;
                }
                skill.cost = cost;
                this.experience.spentSkills += cost;
            }
        }
        // Sum cost from items that have cost field (excluding equipment types)
        // Items with cost: aptitude, criticalInjury, malignancy, mentalDisorder, mutation, 
        // specialAbility, trait, talent, psychicPower
        // Items without cost: weapon, weaponModification, ammunition, armour, forceField, 
        // gear, drug, tool, cybernetic
        let itemsOtherCost = 0;
        for (let item of this.items) {
            if (item.isTalent) {
                let talentAptitudes = item.aptitudes.split(",").map(it => it.trim());
                let matchedAptitudes = characterAptitudes.filter(it => talentAptitudes.includes(it)).length;
                let cost = 0;
                let tier = parseInt(item.tier);
                if (!item.system.starter && tier >= 1 && tier <= 3) {
                    cost = config.talentCosts[tier - 1][2 - matchedAptitudes];
                }
                item.system.cost = cost.toString();
                this.experience.spentTalents += cost;
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(item.cost, 10);
            } else if (["aptitude", "criticalInjury", "malignancy", "mentalDisorder", 
                        "mutation", "specialAbility", "trait"].includes(item.type)) {
                // All other items with cost field go to "Spent on Other"
                const itemCost = parseInt(item.system?.cost || 0, 10);
                itemsOtherCost += itemCost;
            }
        }
        // Set minimum value: if itemsOtherCost > 0, use it; otherwise keep existing spentOther
        this.experience.spentOther = Math.max(itemsOtherCost, this.experience.spentOther || 0);
        this.experience.totalSpent = this.experience.spentCharacteristics
      + this.experience.spentSkills
      + this.experience.spentTalents
      + this.experience.spentPsychicPowers
      + this.experience.spentOther;
        this.experience.remaining = this.experience.value - this.experience.totalSpent;
    }

    _computeExperience_normal() {
        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        if (this.experience.spentOther == null) this.experience.spentOther = 0;
        this.experience.spentPsychicPowers = this.psy.cost;
        for (let characteristic of Object.values(this.characteristics)) {
            this.experience.spentCharacteristics += parseInt(characteristic.cost, 10);
        }
        for (let skill of Object.values(this.skills)) {
            if (skill.isSpecialist) {
                for (let speciality of Object.values(skill.specialities)) {
                    this.experience.spentSkills += parseInt(speciality.cost, 10);
                }
            } else {
                this.experience.spentSkills += parseInt(skill.cost, 10);
            }
        }
        // Sum cost from items that have cost field (excluding equipment types)
        // Items with cost: aptitude, criticalInjury, malignancy, mentalDisorder, mutation, 
        // specialAbility, trait, talent, psychicPower
        // Items without cost: weapon, weaponModification, ammunition, armour, forceField, 
        // gear, drug, tool, cybernetic
        let itemsOtherCost = 0;
        for (let item of this.items) {
            if (item.isTalent) {
                this.experience.spentTalents += parseInt(item.cost, 10);
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(item.cost, 10);
            } else if (["aptitude", "criticalInjury", "malignancy", "mentalDisorder", 
                        "mutation", "specialAbility", "trait"].includes(item.type)) {
                // All other items with cost field go to "Spent on Other"
                const itemCost = parseInt(item.system?.cost || 0, 10);
                itemsOtherCost += itemCost;
            }
        }
        // Set minimum value: if itemsOtherCost > 0, use it; otherwise keep existing spentOther
        this.experience.spentOther = Math.max(itemsOtherCost, this.experience.spentOther || 0);
        this.experience.totalSpent = this.experience.spentCharacteristics
      + this.experience.spentSkills
      + this.experience.spentTalents
      + this.experience.spentPsychicPowers
      + this.experience.spentOther;
        this.experience.remaining = this.experience.value - this.experience.totalSpent;
    }

    _computeExperience() {
        if (game.settings.get("dark-heresy", "autoCalcXPCosts")) this._computeExperience_auto();
        else this._computeExperience_normal();
    }

    _computeArmour() {
        let locations = Object.keys(game.darkHeresy.config.hitLocations);
        let toughness = this.characteristics.toughness;

        // Preserve tempModifier values from existing data
        let existingArmour = this.system.armour || {};
        
        // Use displayBonus from STATS (the "source of truth") which includes tempModifier
        // displayBonus = Math.floor((total + tempModifier) / 10) + unnatural
        // This ensures that changes to toughness tempModifier automatically affect armour
        const toughnessBonus = toughness.displayBonus || 0;
        
        this.system.armour = locations
            .reduce((accumulator, location) =>
                Object.assign(accumulator,
                    {
                        [location]: {
                            total: toughnessBonus,
                            toughnessBonus: toughnessBonus,
                            value: 0,
                            tempModifier: existingArmour[location]?.tempModifier ?? 0
                        }
                    }), {});

        // Object for storing the max armour
        let maxArmour = locations
            .reduce((acc, location) =>
                Object.assign(acc, { [location]: 0 }), {});

        // For each item, find the maximum armour val per location (only equipped items)
        this.items
            .filter(item => item.isArmour && !item.isAdditive && item.isEquipped)
            .reduce((acc, armour) => {
                locations.forEach(location => {
                    let armourVal = armour.part[location] || 0;
                    if (armourVal > acc[location]) {
                        acc[location] = armourVal;
                    }
                });
                return acc;
            }, maxArmour);

        this.items
            .filter(item => item.isArmour && item.isAdditive && item.isEquipped)
            .forEach(armour => {
                locations.forEach(location => {
                    let armourVal = armour.part[location] || 0;
                    maxArmour[location] += armourVal;
                });
            });

        this.armour.head.value = maxArmour.head;
        this.armour.leftArm.value = maxArmour.leftArm;
        this.armour.rightArm.value = maxArmour.rightArm;
        this.armour.body.value = maxArmour.body;
        this.armour.leftLeg.value = maxArmour.leftLeg;
        this.armour.rightLeg.value = maxArmour.rightLeg;

        // Calculate total including temporary modifiers
        this.armour.head.total = this.armour.head.toughnessBonus + this.armour.head.value + (this.armour.head.tempModifier || 0);
        this.armour.leftArm.total = this.armour.leftArm.toughnessBonus + this.armour.leftArm.value + (this.armour.leftArm.tempModifier || 0);
        this.armour.rightArm.total = this.armour.rightArm.toughnessBonus + this.armour.rightArm.value + (this.armour.rightArm.tempModifier || 0);
        this.armour.body.total = this.armour.body.toughnessBonus + this.armour.body.value + (this.armour.body.tempModifier || 0);
        this.armour.leftLeg.total = this.armour.leftLeg.toughnessBonus + this.armour.leftLeg.value + (this.armour.leftLeg.tempModifier || 0);
        this.armour.rightLeg.total = this.armour.rightLeg.toughnessBonus + this.armour.rightLeg.value + (this.armour.rightLeg.tempModifier || 0);
    }

    _computeMovement() {
        let agility = this.characteristics.agility;
        let size = this.size;
        const bonus = this.system.movementBonus || {};
        // Use displayBonus from STATS (the "source of truth") which includes tempModifier
        const base = (agility.displayBonus || agility.bonus) + size - 4;
        const halfBonus = Number(bonus.half) || 0;
        const fullBonus = Number(bonus.full) || 0;
        const chargeBonus = Number(bonus.charge) || 0;
        const runBonus = Number(bonus.run) || 0;
        this.system.movement = {
            half: base + halfBonus,
            full: (base * 2) + fullBonus,
            charge: (base * 3) + chargeBonus,
            run: (base * 6) + runBonus
        };
    }

    _findCharacteristic(short) {
        for (let characteristic of Object.values(this.characteristics)) {
            if (characteristic.short === short) {
                return characteristic;
            }
        }
        return { total: 0 };
    }

    _computeEncumbrance(encumbrance) {
        // Use displayBonus from STATS (the "source of truth") which includes tempModifier
        const attributeBonus = (this.characteristics.strength.displayBonus || this.characteristics.strength.bonus) + (this.characteristics.toughness.displayBonus || this.characteristics.toughness.bonus);
        this.system.encumbrance = {
            max: 0,
            value: encumbrance
        };
        switch (attributeBonus) {
            case 0:
                this.encumbrance.max = 0.9;
                break;
            case 1:
                this.encumbrance.max = 2.25;
                break;
            case 2:
                this.encumbrance.max = 4.5;
                break;
            case 3:
                this.encumbrance.max = 9;
                break;
            case 4:
                this.encumbrance.max = 18;
                break;
            case 5:
                this.encumbrance.max = 27;
                break;
            case 6:
                this.encumbrance.max = 36;
                break;
            case 7:
                this.encumbrance.max = 45;
                break;
            case 8:
                this.encumbrance.max = 56;
                break;
            case 9:
                this.encumbrance.max = 67;
                break;
            case 10:
                this.encumbrance.max = 78;
                break;
            case 11:
                this.encumbrance.max = 90;
                break;
            case 12:
                this.encumbrance.max = 112;
                break;
            case 13:
                this.encumbrance.max = 225;
                break;
            case 14:
                this.encumbrance.max = 337;
                break;
            case 15:
                this.encumbrance.max = 450;
                break;
            case 16:
                this.encumbrance.max = 675;
                break;
            case 17:
                this.encumbrance.max = 900;
                break;
            case 18:
                this.encumbrance.max = 1350;
                break;
            case 19:
                this.encumbrance.max = 1800;
                break;
            case 20:
                this.encumbrance.max = 2250;
                break;
            default:
                this.encumbrance.max = 2250;
                break;
        }
    }


    _getAdvanceCharacteristic(characteristic) {
        switch (characteristic || 0) {
            case 0:
                return "N";
            case 5:
                return "S";
            case 10:
                return "I";
            case 15:
                return "T";
            case 20:
                return "P";
            case 25:
                return "E";
            default:
                return "N";
        }
    }

    _getAdvanceSkill(skill) {
        switch (skill || 0) {
            case -20:
                return "U";
            case 0:
                return "K";
            case 10:
                return "T";
            case 20:
                return "E";
            case 30:
                return "V";
            default:
                return "U";
        }
    }

    /**
     * Preview how damage would be applied without updating the actor.
     * @param {object[]} damages
     * @returns {{damageTaken: object[], wounds: number, criticalWounds: number}}
     */
    previewDamage(damages) {
        let wounds = this.wounds.value;
        let criticalWounds = this.wounds.critical;
        const damageTaken = [];
        const maxWounds = this.wounds.max;

        for (const damage of damages) {
            const penetrationValue = Number(damage.penetration) || 0;
            // _getArmour returns total which already includes toughnessBonus, so we don't subtract it again
            let armour = Math.max(this._getArmour(damage.location) - penetrationValue, 0);
            const damageAmount = Number(damage.amount) || 0;
            let woundsToAdd = Math.max(damageAmount - armour, 0);

            if (damage.righteousFury && woundsToAdd === 0) {
                woundsToAdd = 1;
            } else if (damage.righteousFury) {
                this._recordDamage(damageTaken, damage.righteousFury, damage, "Critical Effect (RF)");
            }

            if (wounds === maxWounds) {
                criticalWounds += woundsToAdd;
                this._recordDamage(damageTaken, woundsToAdd, damage, "Critical");
            } else if (wounds + woundsToAdd > maxWounds) {
                this._recordDamage(damageTaken, maxWounds - wounds, damage, "Wounds");

                woundsToAdd = (wounds + woundsToAdd) - maxWounds;
                criticalWounds += woundsToAdd;
                wounds = maxWounds;
                this._recordDamage(damageTaken, woundsToAdd, damage, "Critical");
            } else {
                this._recordDamage(damageTaken, woundsToAdd, damage, "Wounds");
                wounds += woundsToAdd;
            }
        }

        return { damageTaken, wounds, criticalWounds };
    }

    /**
     * Apply wounds to the actor, takes into account the armour value
     * and the area of the hit.
     * @param {object[]} damages            Array of damage objects to apply to the Actor
     * @param {number} damages.amount       An amount of damage to sustain
     * @param {string} damages.location     Localised location of the body part taking damage
     * @param {number} damages.penetration  Amount of penetration from the attack
     * @param {string} damages.type         Type of damage
     * @param {number} damages.righteousFury Amount rolled on the righteous fury die, defaults to 0
     * @returns {Promise<Actor>}             A Promise which resolves once the damage has been applied
     */
    async applyDamage(damages) {
        if (this.system?.horde > 0) {
            const beforeHorde = Number(this.system.horde) || 0;
            let kills = 0;
            const weaponClass = damages?.[0]?.weaponClass;
            const weaponType = damages?.[0]?.weaponType;
            const attackDos = Number(damages?.[0]?.attackDos) || 0;
            let anyDamage = false;
            
            // For ranged weapons: 1 kill per hit that deals damage
            if (weaponClass !== "melee") {
                for (const damage of damages) {
                    const penetrationValue = Number(damage.penetration) || 0;
                    // _getArmour returns total which already includes toughnessBonus, so we don't subtract it again
                    const armour = Math.max(this._getArmour(damage.location) - penetrationValue, 0);
                    const damageAmount = Number(damage.amount) || 0;
                    const woundsToAdd = Math.max(damageAmount - armour, 0);
                    if (woundsToAdd > 0) {
                        anyDamage = true;
                        kills += 1;
                    }
                }
            } else {
                // For melee weapons: check each damage roll separately
                // Each damage roll represents a potential kill (based on DoS/2)
                // Kill is counted only if damage penetrates armor by at least 1
                for (const damage of damages) {
                    const penetrationValue = Number(damage.penetration) || 0;
                    // _getArmour returns total which already includes toughnessBonus, so we don't subtract it again
                    const armour = Math.max(this._getArmour(damage.location) - penetrationValue, 0);
                    const damageAmount = Number(damage.amount) || 0;
                    const woundsToAdd = Math.max(damageAmount - armour, 0);
                    if (woundsToAdd > 0) {
                        anyDamage = true;
                        kills += 1; // Each successful damage penetration = 1 kill
                    }
                }
                
                // Check for Force trait: double kills if any kills were made
                const weaponTraits = damages?.[0]?.weaponTraits || {};
                if (kills > 0 && weaponTraits.force === true) {
                    kills += kills;
                }
            }

            // Apply devastating weapon trait: additional horde size reduction on successful hit
            if (anyDamage && damages?.[0]?.devastating) {
                const devastatingValue = Number(damages[0].devastating) || 0;
                if (devastatingValue > 0) {
                    kills += devastatingValue;
                }
            }

            if (kills <= 0) return this;
            const newHorde = Math.max((Number(this.system.horde) || 0) - kills, 0);
            this._suppressWoundsFloat = true;
            let result;
            try {
                result = await this.update({ "system.horde": newHorde });
            } finally {
                delete this._suppressWoundsFloat;
            }
            _showWoundsFloat(this, newHorde - beforeHorde, { invert: true });
            return result;
        }

        const beforeTotal = (Number(this.wounds.value) || 0) + (Number(this.wounds.critical) || 0);
        let wounds = this.wounds.value;
        let criticalWounds = this.wounds.critical;
        const damageTaken = [];
        const maxWounds = this.wounds.max;

        // Apply damage from multiple hits
        for (const damage of damages) {
            // Get the armour for the location and minus penetration, no negatives
            // _getArmour returns total which already includes toughnessBonus, so we don't subtract it again
            // Ensure penetration is a valid number, defaulting to 0 if invalid
            const penetrationValue = Number(damage.penetration) || 0;
            let armour = Math.max(this._getArmour(damage.location) - penetrationValue, 0);
            // Total already includes toughnessBonus, so we just use damage amount directly
            const damageAmount = Number(damage.amount) || 0;

            // Calculate wounds to add, reducing damage by armour after pen
            let woundsToAdd = Math.max(damageAmount - armour, 0);

            // If no wounds inflicted and righteous fury was rolled, attack causes one wound
            if (damage.righteousFury && woundsToAdd === 0) {
                woundsToAdd = 1;
            } else if (damage.righteousFury) {
                // Roll on crit table but don't add critical wounds
                this._recordDamage(damageTaken, damage.righteousFury, damage, "Critical Effect (RF)");
            }

            // Check for critical wounds
            if (wounds === maxWounds) {
                // All new wounds are critical
                criticalWounds += woundsToAdd;
                this._recordDamage(damageTaken, woundsToAdd, damage, "Critical");

            } else if (wounds + woundsToAdd > maxWounds) {
                // Will bring wounds to max and add left overs as crits
                this._recordDamage(damageTaken, maxWounds - wounds, damage, "Wounds");

                woundsToAdd = (wounds + woundsToAdd) - maxWounds;
                criticalWounds += woundsToAdd;
                wounds = maxWounds;
                this._recordDamage(damageTaken, woundsToAdd, damage, "Critical");
            } else {
                this._recordDamage(damageTaken, woundsToAdd, damage, "Wounds");
                wounds += woundsToAdd;
            }
        }

        // Update the Actor
        const updates = {
            "system.wounds.value": wounds,
            "system.wounds.critical": criticalWounds
        };

        // Delegate damage application to a hook
        const allowed = Hooks.call("modifyTokenAttribute", {
            attribute: "wounds.value",
            value: this.wounds.value,
            isDelta: false,
            isBar: true
        }, updates);

        await this._showCritMessage(damageTaken, this.name, wounds, criticalWounds);
        if (allowed === false) return this;
        this._suppressWoundsFloat = true;
        let result;
        try {
            result = await this.update(updates);
        } finally {
            delete this._suppressWoundsFloat;
        }
        const afterTotal = (Number(wounds) || 0) + (Number(criticalWounds) || 0);
        _showWoundsFloat(this, afterTotal - beforeTotal);
        
        // Check for Shock weapon trait: trigger Toughness test if any damage was dealt
        if (damages && damages.length > 0) {
            const weaponTraits = damages[0]?.weaponTraits || {};
            if (weaponTraits.shock) {
                const anyDamageDealt = damages.some(d => {
                    const penetrationValue = Number(d.penetration) || 0;
                    const armour = Math.max(this._getArmour(d.location) - penetrationValue, 0);
                    const damageAmount = Number(d.amount) || 0;
                    const woundsToAdd = Math.max(damageAmount - armour, 0);
                    return woundsToAdd > 0 || d.righteousFury;
                });
                
                if (anyDamageDealt) {
                    // Trigger automatic Toughness test for Shock weapon
                    await _triggerShockToughnessTest(this, damages[0]);
                }
            }
        }
        
        return result;
    }

    /**
     * Check if actor has a condition by key
     * @param {string} key - Condition key (id)
     * @returns {ActiveEffect|undefined} - The effect if found, undefined otherwise
     */
    hasCondition(key) {
        // First check actor effects
        const found = this.effects.find(e => {
            if (e.disabled) return false;
            
            // Check for key directly (like impmal uses e.key)
            // Also check flags and system as fallback
            const effectKey = e.key || e.flags?.["dark-heresy"]?.key || e.system?.key;
            if (effectKey === key) {
                return true;
            }
            
            // Also check statuses array (for backward compatibility with old effects)
            const statuses = e.statuses || e.toObject?.()?.statuses || e.system?.statuses;
            if (statuses && Array.isArray(statuses) && statuses.includes(key)) {
                return true;
            }
            
            return false;
        });
        
        if (found) {
            return found;
        }
        
        // If not found in actor effects, check token statuses (conditions can be applied via token overlay)
        const tokens = this.getActiveTokens(true);
        if (tokens.length > 0) {
            const token = tokens[0];
            if (token?.document) {
                const tokenStatuses = token.document.statuses;
                if (tokenStatuses instanceof Set && tokenStatuses.has(key)) {
                    // Return a dummy object to indicate condition exists
                    return { _fromToken: true, key: key };
                }
            }
        }
        
        return found;
    }

    /**
     * Add a condition to the actor
     * @param {string} key - Condition key (id)
     * @param {object} options - Options object with type (minor/major)
     * @param {object} mergeData - Additional data to merge into effect
     * @returns {Promise<ActiveEffect>} - The created or updated effect
     */
    async addCondition(key, options = {}, mergeData = {}) {
        const type = options.type || "minor";
        const existing = this.hasCondition(key);
        let effectData;

        if (existing) {
            // Check if existing is minor and we're trying to add major
            const existingType = existing.system?.type || "minor";
            if (existingType === "minor" && type === "major") {
                // Escalate to major
                effectData = DarkHeresyUtil.findEffect(key, "major");
            } else {
                // Already has condition at this level or higher
                return existing;
            }
        } else {
            // Create new condition
            effectData = DarkHeresyUtil.findEffect(key, type);
        }

        if (!effectData) {
            console.warn(`Dark Heresy: Effect not found for key "${key}"`);
            return null;
        }

        const createData = DarkHeresyUtil.getCreateData(effectData, key);
        foundry.utils.mergeObject(createData, mergeData);

        // If existing, update it (escalate minor to major)
        if (existing && existing.system?.type === "minor" && type === "major") {
            return existing.update(createData);
        } else if (!existing) {
            // Create new effect
            const effects = await this.createEmbeddedDocuments("ActiveEffect", [createData]);
            return effects[0];
        }

        return existing;
    }

    /**
     * Remove a condition from the actor
     * @param {string} key - Condition key (id)
     * @returns {Promise<ActiveEffect|undefined>} - The deleted or updated effect
     */
    async removeCondition(key) {
        const existing = this.hasCondition(key);
        if (!existing) {
            return;
        }

        const existingType = existing.system?.type || "minor";
        
        if (existingType === "major") {
            // Downgrade major to minor
            const effectData = DarkHeresyUtil.findEffect(key, "minor");
            if (effectData) {
                const createData = DarkHeresyUtil.getCreateData(effectData, key);
                return existing.update(createData);
            }
        } else {
            // Delete minor condition
            return existing.delete();
        }
    }

    /**
     * Toggle status effect (for compatibility with Foundry VTT standard API)
     * This method is called when status effects are toggled via token or other means
     * It uses the same addCondition/removeCondition logic as the sheet
     * @param {string} statusId - Status effect ID
     * @returns {Promise<boolean>} - Whether the status is now active
     */
    async toggleStatusEffect(statusId) {
        // Check if it's a condition from CONFIG.statusEffects
        const statusEffect = CONFIG.statusEffects.find(s => s.id === statusId);
        if (!statusEffect) {
            // Not a condition, use default Foundry behavior
            return super.toggleStatusEffect?.(statusId) || false;
        }
        
        // Use our condition system
        const existing = this.hasCondition(statusId);
        if (existing) {
            await this.removeCondition(statusId);
            return false;
        } else {
            await this.addCondition(statusId, { type: "minor" });
            return true;
        }
    }

    /**
     * Records damage to be shown as in chat
     * @param {object[]} damageRolls array to record damages
     * @param {number} damageRolls.damage amount of damage dealt
     * @param {string} damageRolls.source source of the damage e.g. Critical
     * @param {string} damageRolls.location location taking the damage
     * @param {string} damageRolls.type type of the damage
     * @param {number} damage amount of damage dealt
     * @param {object} damageObject damage object containing location and type
     * @param {string} damageObject.location damage location
     * @param {string} damageObject.type damage type
     * @param {string} source source of the damage
     */
    _recordDamage(damageRolls, damage, damageObject, source) {
        damageRolls.push({
            damage,
            source,
            location: damageObject.location,
            type: damageObject.type,
            penetration: damageObject.penetration
        });
    }

    /**
     * Gets the armour value not including toughness bonus for a non-localized location string
     * @param {string} location
     * @returns {number} armour value for the location
     */
    _getArmour(location) {
        // Use total directly from character sheet - it already includes toughnessBonus + value + tempModifier
        // This ensures we use the exact value displayed in the UI
        switch (location) {
            case "ARMOUR.HEAD":
                return Number(this.armour.head.total || 0);
            case "ARMOUR.LEFT_ARM":
                return Number(this.armour.leftArm.total || 0);
            case "ARMOUR.RIGHT_ARM":
                return Number(this.armour.rightArm.total || 0);
            case "ARMOUR.BODY":
                return Number(this.armour.body.total || 0);
            case "ARMOUR.LEFT_LEG":
                return Number(this.armour.leftLeg.total || 0);
            case "ARMOUR.RIGHT_LEG":
                return Number(this.armour.rightLeg.total || 0);
            default:
                return 0;
        }
    }

    _getArmourTotal(location) {
        switch (location) {
            case "ARMOUR.HEAD":
                return this.armour.head.total;
            case "ARMOUR.LEFT_ARM":
                return this.armour.leftArm.total;
            case "ARMOUR.RIGHT_ARM":
                return this.armour.rightArm.total;
            case "ARMOUR.BODY":
                return this.armour.body.total;
            case "ARMOUR.LEFT_LEG":
                return this.armour.leftLeg.total;
            case "ARMOUR.RIGHT_LEG":
                return this.armour.rightLeg.total;
            default:
                return 0;
        }
    }

    /**
     * Helper to show that an effect from the critical table needs to be applied.
     * TODO: This needs styling, rewording and ideally would roll on the crit tables for you
     * @param {object[]} rolls Array of critical rolls
     * @param {number} rolls.damage Damage applied
     * @param {string} rolls.type Letter representing the damage type
     * @param {string} rolls.source What kind of damage represented
     * @param {string} rolls.location Where this damage applied against for armor and AP considerations
     * @param {number} target
     * @param {number} totalWounds
     * @param {number} totalCritWounds
     */
    async _showCritMessage(rolls, target, totalWounds, totalCritWounds) {
        if (rolls.length === 0) return;
        if (this._suppressCritChat) return;
        const html = await renderTemplate("systems/dark-heresy/template/chat/critical.hbs", {
            rolls,
            target,
            totalWounds,
            totalCritWounds
        });
        const sourceMessageId = this._damageSourceMessageId;
        const flags = sourceMessageId ? { "dark-heresy": { sourceMessageId } } : undefined;
        ChatMessage.create({ content: html, flags });
    }

    get attributeBoni() {
        let boni = [];
        for (let characteristic of Object.values(this.characteristics)) {
            // Use displayBonus from STATS (the "source of truth") which includes tempModifier
            const bonusValue = characteristic.displayBonus || characteristic.bonus;
            boni.push({ regex: new RegExp(`${characteristic.short}B`, "gi"), value: bonusValue });
        }
        return boni;
    }

    get characteristics() {return this.system.characteristics;}

    get skills() { return this.system.skills; }

    get initiative() { return this.system.initiative; }

    get wounds() { return this.system.wounds; }

    /**
     * Provide standard Foundry VTT attributes.hp format for module compatibility (e.g., Health Estimate)
     * Health Estimate module expects hp.value to represent current damage/wounds, not remaining health
     */
    get attributes() {
        const wounds = this.system.wounds || {};
        const maxWounds = Number(wounds.max) || 0;
        const currentWounds = Number(wounds.value) || 0;
        return {
            hp: {
                value: currentWounds,
                max: maxWounds,
                min: 0
            }
        };
    }

    get fatigue() { return this.system.fatigue; }

    get fate() { return this.system.fate; }

    get psy() { return this.system.psy; }

    get bio() { return this.system.bio; }

    get experience() { return this.system.experience; }

    get insanity() { return this.system.insanity; }

    get corruption() { return this.system.corruption; }

    get aptitudes() { return this.system.aptitudes; }

    get size() { return this.system.size; }

    get faction() { return this.system.faction; }

    get subfaction() { return this.system.subfaction; }

    get subtype() { return this.system.type; }

    get threatLevel() { return this.system.threatLevel; }

    get horde() { return this.system.horde; }

    get armour() { return this.system.armour; }

    get encumbrance() { return this.system.encumbrance; }

    get movement() { return this.system.movement; }

}

class DarkHeresyItem extends Item {
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        // Set default icon if not provided
        if (!data.img && CONFIG.Item.defaultIcons && CONFIG.Item.defaultIcons[data.type]) {
            this.updateSource({ img: CONFIG.Item.defaultIcons[data.type] });
        }
    }

    async sendToChat() {
        // Use the item itself instead of creating a new instance
        const item = this;
        const html = await renderTemplate("systems/dark-heresy/template/chat/item.hbs", {item, data: item.system});
        const chatData = {
            user: game.user.id,
            rollMode: game.settings.get("core", "rollMode"),
            content: html
        };
        if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
            chatData.whisper = ChatMessage.getWhisperRecipients("GM");
        } else if (chatData.rollMode === "selfroll") {
            chatData.whisper = [game.user];
        }
        await ChatMessage.create(chatData);
    }

    get Clip() { 
        const clip = this.clip || {};
        const value = Number(clip.value) || 0;
        const max = Number(clip.max) || 0;
        if (max === 0) return "-";
        return `${value}/${max}`;
    }

    get RateOfFire() {
        let rof = this.rateOfFire;
        let single = rof.single > 0 ? "S" : "-";
        let burst = rof.burst > 0 ? `${rof.burst}` : "-";
        let full = rof.full > 0 ? `${rof.full}` : "-";
        return `${single}/${burst}/${full}`;
    }

    get DamageTypeShort() {
        switch (this.damageType) {
            case "energy":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY_SHORT");
            case "impact":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
            case "rending":
                return game.i18n.localize("DAMAGE_TYPE.RENDING_SHORT");
            case "explosive":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE_SHORT");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
        }
    }

    get DamageType() {
        switch (this.damageType) {
            case "energy":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY");
            case "impact":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
            case "rending":
                return game.i18n.localize("DAMAGE_TYPE.RENDING");
            case "explosive":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
        }
    }

    get WeaponClass() {

        switch (this.class) {
            case "melee":
                return game.i18n.localize("WEAPON.MELEE");
            case "thrown":
                return game.i18n.localize("WEAPON.THROWN");
            case "launched":
                return game.i18n.localize("WEAPON.LAUNCHED");
            case "placed":
                return game.i18n.localize("WEAPON.PLACED");
            case "pistol":
                return game.i18n.localize("WEAPON.PISTOL");
            case "basic":
                return game.i18n.localize("WEAPON.BASIC");
            case "heavy":
                return game.i18n.localize("WEAPON.HEAVY");
            case "vehicle":
                return game.i18n.localize("WEAPON.VEHICLE");
            default:
                return game.i18n.localize("WEAPON.MELEE");
        }
    }

    get WeaponType() {

        switch (this.subtype) {
            case "las":
                return game.i18n.localize("WEAPON.LAS");
            case "solidprojectile":
                return game.i18n.localize("WEAPON.SOLIDPROJECTILE");
            case "bolt":
                return game.i18n.localize("WEAPON.BOLT");
            case "melta":
                return game.i18n.localize("WEAPON.MELTA");
            case "plasma":
                return game.i18n.localize("WEAPON.PLASMA");
            case "flame":
                return game.i18n.localize("WEAPON.FLAME");
            case "lowtech":
                return game.i18n.localize("WEAPON.LOWTECH");
            case "launcher":
                return game.i18n.localize("WEAPON.LAUNCHER");
            case "explosive":
                return game.i18n.localize("WEAPON.EXPLOSIVE");
            case "exotic":
                return game.i18n.localize("WEAPON.EXOTIC");
            case "chain":
                return game.i18n.localize("WEAPON.CHAIN");
            case "power":
                return game.i18n.localize("WEAPON.POWER");
            case "shock":
                return game.i18n.localize("WEAPON.SHOCK");
            case "force":
                return game.i18n.localize("WEAPON.FORCE");
            default: return "";
        }
    }

    get Craftsmanship() {
        switch (this.craftsmanship) {
            case "poor":
                return game.i18n.localize("CRAFTSMANSHIP.POOR");
            case "common":
                return game.i18n.localize("CRAFTSMANSHIP.COMMON");
            case "good":
                return game.i18n.localize("CRAFTSMANSHIP.GOOD");
            case "best":
                return game.i18n.localize("CRAFTSMANSHIP.BEST");
            default:
                return game.i18n.localize("CRAFTSMANSHIP.COMMON");
        }
    }

    get Availability() {
        switch (this.availability) {
            case "ubiquitous":
                return game.i18n.localize("AVAILABILITY.UBIQUITOUS");
            case "abundant":
                return game.i18n.localize("AVAILABILITY.ABUNDANT");
            case "plentiful":
                return game.i18n.localize("AVAILABILITY.PLENTIFUL");
            case "common":
                return game.i18n.localize("AVAILABILITY.COMMON");
            case "average":
                return game.i18n.localize("AVAILABILITY.AVERAGE");
            case "scarce":
                return game.i18n.localize("AVAILABILITY.SCARCE");
            case "rare":
                return game.i18n.localize("AVAILABILITY.RARE");
            case "very-rare":
                return game.i18n.localize("AVAILABILITY.VERY_RARE");
            case "extremely-rare":
                return game.i18n.localize("AVAILABILITY.EXTREMELY_RARE");
            case "near-unique":
                return game.i18n.localize("AVAILABILITY.NEAR_UNIQUE");
            case "Unique":
                return game.i18n.localize("AVAILABILITY.UNIQUE");
            default:
                return game.i18n.localize("AVAILABILITY.COMMON");
        }
    }

    get ArmourType() {
        switch (this.subtype) {
            case "basic":
                return game.i18n.localize("ARMOUR_TYPE.BASIC");
            case "flak":
                return game.i18n.localize("ARMOUR_TYPE.FLAK");
            case "mesh":
                return game.i18n.localize("ARMOUR_TYPE.MESH");
            case "carapace":
                return game.i18n.localize("ARMOUR_TYPE.CARAPACE");
            case "power":
                return game.i18n.localize("ARMOUR_TYPE.POWER");
            default:
                return game.i18n.localize("ARMOUR_TYPE.COMMON");
        }
    }

    get Part() {
        let part = this.part;
        let parts = [];
        if (part.head > 0) parts.push(`${game.i18n.localize("ARMOUR.HEAD")} (${part.head})`);
        if (part.leftArm > 0) parts.push(`${game.i18n.localize("ARMOUR.LEFT_ARM")} (${part.leftArm})`);
        if (part.rightArm > 0) parts.push(`${game.i18n.localize("ARMOUR.RIGHT_ARM")} (${part.rightArm})`);
        if (part.body > 0) parts.push(`${game.i18n.localize("ARMOUR.BODY")} (${part.body})`);
        if (part.leftLeg > 0) parts.push(`${game.i18n.localize("ARMOUR.LEFT_LEG")} (${part.leftLeg})`);
        if (part.rightLeg > 0) parts.push(`${game.i18n.localize("ARMOUR.RIGHT_LEG")} (${part.rightLeg})`);
        return parts.join(" / ");
    }

    get PartLocation() {
        switch (this.part) {
            case "head":
                return game.i18n.localize("ARMOUR.HEAD");
            case "leftArm":
                return game.i18n.localize("ARMOUR.LEFT_ARM");
            case "rightArm":
                return game.i18n.localize("ARMOUR.RIGHT_ARM");
            case "body":
                return game.i18n.localize("ARMOUR.BODY");
            case "leftLeg":
                return game.i18n.localize("ARMOUR.LEFT_LEG");
            case "rightLeg":
                return game.i18n.localize("ARMOUR.RIGHT_LEG");
            default:
                return game.i18n.localize("ARMOUR.BODY");
        }
    }

    get PsychicPowerZone() {
        switch (this.damage.zone) {
            case "bolt":
                return game.i18n.localize("PSYCHIC_POWER.BOLT");
            case "barrage":
                return game.i18n.localize("PSYCHIC_POWER.BARRAGE");
            case "storm":
                return game.i18n.localize("PSYCHIC_POWER.STORM");
            default:
                return game.i18n.localize("PSYCHIC_POWER.BOLT");
        }
    }

    get isInstalled() { return this.installed
        ? game.i18n.localize("Yes")
        : game.i18n.localize("No");
    }


    get isMentalDisorder() { return this.type === "mentalDisorder"; }

    get isMalignancy() { return this.type === "malignancy"; }

    get isMutation() { return this.type === "mutation"; }

    get isTalent() { return this.type === "talent"; }

    get isTrait() { return this.type === "trait"; }

    get isAptitude() { return this.type === "aptitude"; }

    get isSpecialAbility() { return this.type === "specialAbility"; }

    get isPsychicPower() { return this.type === "psychicPower"; }

    get isCriticalInjury() { return this.type === "criticalInjury"; }

    get isWeapon() { return this.type === "weapon"; }

    get isArmour() { return this.type === "armour"; }

    get isGear() { return this.type === "gear"; }

    get isDrug() { return this.type === "drug"; }

    get isTool() { return this.type === "tool"; }

    get isCybernetic() { return this.type === "cybernetic"; }

    get isWeaponModification() { return this.type === "weaponModification"; }

    get isAmmunition() { return this.type === "ammunition"; }

    get isForceField() { return this.type === "forceField"; }

    get isEquipped() { return this.system.equipped === true; }

    get isAbilities() { return this.isTalent || this.isTrait || this.isSpecialAbility; }

    get isAdditive() { return this.system.isAdditive; }

    get craftsmanship() { return this.system.craftsmanship;}

    get description() { return this.system.description;}

    get availability() { return this.system.availability;}

    get weight() { return this.system.weight;}

    get quantity() { return this.system.quantity;}

    get weightSum() { return this.system.quantity * this.system.weight;}

    get effect() { return this.system.effect;}

    get weapon() { return this.system.weapon;}

    get source() { return this.system.source;}

    get subtype() { return this.system.type;}

    get part() { return this.system.part;}

    get maxAgility() { return this.system.maxAgility;}

    get installed() { return this.system.installed;}

    get shortDescription() { return this.system.shortDescription;}

    get protectionRating() { return this.system.protectionRating;}

    get overloadChance() { return this.system.overloadChance;}

    get cost() { return this.system.cost;}

    get prerequisite() { return this.system.prerequisite;}

    get action() { return this.system.action;}

    get focusPower() { return this.system.focusPower;}

    get range() { return this.system.range;}

    get sustained() { return this.system.sustained;}

    get psychicType() { return this.system.subtype;}

    get damage() { return this.system.damage;}

    get benefit() { return this.system.benefit;}

    get prerequisites() { return this.system.prerequisites;}

    get aptitudes() { return this.system.aptitudes;}

    get starter() { return this.system.starter;}

    get tier() { return this.system.tier;}

    get class() { return this.system.class;}

    get rateOfFire() { return this.system.rateOfFire;}

    get damageType() {
        return this.system.damageType
        || this.system?.damage?.type
        || this.system.effect?.damage?.type
        || this.system.type;
    }

    get penetration() { return this.system.penetration;}

    get clip() { return this.system.clip;}

    get reload() { return this.system.reload;}

    get special() { return this.system.special;}

    get attack() { return this.system.attack;}

    get upgrades() { return this.system.upgrades;}

}

/**
 * A helper class for building MeasuredTemplates (adapted from https://github.com/foundryvtt/dnd5e).
 */
class PlaceableTemplate extends MeasuredTemplate {

    /**
     * Track the timestamp when the last mouse move event was captured.
     * @type {number}
     */
    #moveTime = 0;

    /* -------------------------------------------- */

    /**
     * The initially active CanvasLayer to re-activate after the workflow is complete.
     * @type {CanvasLayer}
     */
    #initialLayer;

    /* -------------------------------------------- */

    /**
     * Track the bound event handlers so they can be properly canceled later.
     * @type {object}
     */
    #events;

    /* -------------------------------------------- */

    /**
     * A factory method to create a cone PlaceableTemplate instance
     * @param {string} origin  The id of the item originating the cone.
     * @param {number} angle   The cone angle.
     * @param {number} length  The cone length.
     * @returns {PlaceableTemplate}    The template .
     */
    static cone(origin, angle, length) {
        const templateData = {
            t: "cone",
            user: game.user.id,
            distance: length,
            direction: 0,
            x: 0,
            y: 0,
            fillColor: game.user.color,
            flags: { "dark-heresy": { origin: origin } },
            angle: angle
        };
        const cls = CONFIG.MeasuredTemplate.documentClass;
        const template = new cls(templateData, {parent: canvas.scene});
        const object = new this(template);
        object.actorSheet = game.actors.get(origin.actor).sheet || null;
        return object;
    }

    /* -------------------------------------------- */

    /**
     * Creates a preview of the ability template.
     * @returns {Promise}  A promise that resolves with the final measured template if created.
     */
    drawPreview() {
        const initialLayer = canvas.activeLayer;

        // Draw the template and switch to the template layer
        this.draw();
        this.layer.activate();
        this.layer.preview.addChild(this);

        // Hide the sheet that originated the preview
        this.actorSheet?.minimize();

        // Activate interactivity
        return this.activatePreviewListeners(initialLayer);
    }

    /* -------------------------------------------- */

    /**
     * Activate listeners for the template preview
     * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
     * @returns {Promise}                 A promise that resolves with the final measured template if created.
     */
    activatePreviewListeners(initialLayer) {
        return new Promise((resolve, reject) => {
            this.#initialLayer = initialLayer;
            this.#events = {
                cancel: this._onCancelPlacement.bind(this),
                confirm: this._onConfirmPlacement.bind(this),
                move: this._onMovePlacement.bind(this),
                resolve,
                reject,
                rotate: this._onRotatePlacement.bind(this)
            };

            // Activate listeners
            canvas.stage.on("mousemove", this.#events.move);
            canvas.stage.on("mousedown", this.#events.confirm);
            canvas.app.view.oncontextmenu = this.#events.cancel;
            canvas.app.view.onwheel = this.#events.rotate;
        });
    }

    /* -------------------------------------------- */

    /**
     * Shared code for when template placement ends by being confirmed or canceled.
     * @param {Event} event  Triggering event that ended the placement.
     */
    async _finishPlacement(event) {
        this.layer._onDragLeftCancel(event);
        canvas.stage.off("mousemove", this.#events.move);
        canvas.stage.off("mousedown", this.#events.confirm);
        canvas.app.view.oncontextmenu = null;
        canvas.app.view.onwheel = null;
        this.#initialLayer.activate();
        await this.actorSheet?.maximize();
    }

    /* -------------------------------------------- */

    /**
     * Move the template preview when the mouse moves.
     * @param {Event} event  Triggering mouse event.
     */
    _onMovePlacement(event) {
        event.stopPropagation();
        const now = Date.now(); // Apply a 20ms throttle
        if ( now - this.#moveTime <= 20 ) return;
        const center = event.data.getLocalPosition(this.layer);
        const interval = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ? 0 : 2;
        const snapped = canvas.grid.getSnappedPosition(center.x, center.y, interval);
        this.document.updateSource({x: snapped.x, y: snapped.y});
        this.refresh();
        this.#moveTime = now;
    }

    /* -------------------------------------------- */

    /**
     * Rotate the template preview by 3Лљ increments when the mouse wheel is rotated.
     * @param {Event} event  Triggering mouse event.
     */
    _onRotatePlacement(event) {
        if ( event.ctrlKey ) event.preventDefault(); // Avoid zooming the browser window
        event.stopPropagation();
        const delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
        const snap = event.shiftKey ? delta : 5;
        const update = {direction: this.document.direction + (snap * Math.sign(event.deltaY))};
        this.document.updateSource(update);
        this.refresh();
    }

    /* -------------------------------------------- */

    /**
     * Confirm placement when the left mouse button is clicked.
     * @param {Event} event  Triggering mouse event.
     */
    async _onConfirmPlacement(event) {
        await this._finishPlacement(event);
        const interval = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ? 0 : 2;
        const destination = canvas.grid.getSnappedPosition(this.document.x, this.document.y, interval);
        this.document.updateSource(destination);
        this.#events.resolve(canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [this.document.toObject()]));
    }

    /* -------------------------------------------- */

    /**
     * Cancel placement when the right mouse button is clicked.
     * @param {Event} event  Triggering mouse event.
     */
    async _onCancelPlacement(event) {
        await this._finishPlacement(event);
        this.#events.reject();
    }

}

/**
 * Roll a generic roll, and post the result to chat.
 * @param {object} rollData
 */
async function commonRoll(rollData) {
    await _computeCommonTarget(rollData);
    await _rollTarget(rollData);
    if (rollData.flags.isEvasion) {
        if (rollData.attackType && rollData.weapon?.traits) {
            _computeRateOfFire(rollData);
            rollData.numberOfHits = _computeNumberOfHits(
                rollData.attackDos,
                rollData.dos,
                rollData.attackType,
                rollData.shotsFired,
                rollData.weapon.traits);
        }
    }
    await _sendRollToChat(rollData);
    await _applyRegeneration(rollData);
}

async function _applyRegeneration(rollData) {
    if (!rollData?.flags?.isRegeneration) return;
    let actor = null;
    if (rollData.tokenUuid) {
        const resolved = await fromUuid(rollData.tokenUuid);
        actor = resolved?.actor || null;
    }
    if (!actor && rollData.actorUuid) {
        const resolved = await fromUuid(rollData.actorUuid);
        actor = resolved?.actor || resolved || null;
    }
    if (!actor && rollData.tokenId) {
        const scene = rollData.sceneId ? game.scenes?.get(rollData.sceneId) : canvas?.scene;
        const tokenDoc = scene?.tokens?.get(rollData.tokenId);
        actor = tokenDoc?.actor || null;
    }
    if (!actor && rollData.ownerId) {
        actor = game.actors.get(rollData.ownerId) || null;
    }
    if (!actor) return;
    if (!rollData.flags.isSuccess) return;
    const amount = Number(rollData.regeneration) || 0;
    if (amount <= 0) return;
    const currentWounds = Number(actor.system?.wounds?.value) || 0;
    const currentCritical = Number(actor.system?.wounds?.critical) || 0;
    if (currentWounds <= 0 && currentCritical <= 0) return;
    let remaining = amount;
    const newCritical = Math.max(currentCritical - remaining, 0);
    remaining = Math.max(remaining - currentCritical, 0);
    const newWounds = Math.max(currentWounds - remaining, 0);
    const delta = (newWounds + newCritical) - (currentWounds + currentCritical);
    actor._suppressWoundsFloat = true;
    try {
        await actor.update({
            "system.wounds.value": newWounds,
            "system.wounds.critical": newCritical
        });
    } finally {
        delete actor._suppressWoundsFloat;
    }
    _showWoundsFloat(actor, delta, { effect: "regen" });
}

/**
 * Roll a combat roll, and post the result to chat.
 * @param {object} rollData
 */
async function combatRoll(rollData) {
    if (rollData.weapon.traits.spray && game.settings.get("dark-heresy", "useSpraytemplate")) {
        let template = PlaceableTemplate.cone({ item: rollData.itemId, actor: rollData.ownerId },
            30, rollData.weapon.range);
        await template.drawPreview();
    }
    if (rollData.attackType?.name === "suppression") {
        let template = PlaceableTemplate.cone({ item: rollData.itemId, actor: rollData.ownerId },
            45, rollData.weapon.range);
        await template.drawPreview();
    }
    // Check if actor is blinded and weapon is ranged - auto-fail ranged attacks
    const actor = game.actors.get(rollData.ownerId);
    if (actor && rollData.weapon?.isRange) {
        const tokens = actor.getActiveTokens(true);
        if (tokens.length > 0) {
            const token = tokens[0];
            const isBlinded = _hasCondition(token, "blinded");
            
            if (isBlinded) {
                // Auto-fail ranged attacks for blinded characters
                await _computeCombatTarget(rollData);
                rollData.result = 100; // Set result to 100 (guaranteed failure)
                rollData.flags.isSuccess = false;
                rollData.dof = Math.max(rollData.target.final - 100, 0);
                rollData.dos = 0;
                rollData.numberOfHits = 0;
                rollData.attackDos = 0;
                rollData.attackResult = rollData.result;
                await _sendRollToChat(rollData);
                // Consume ammo even on failed attack
                await _consumeAmmo(rollData);
                return;
            }
        }
    }
    
    if (rollData.weapon.traits.skipAttackRoll) {
        rollData.attackResult = 5; // Attacks that skip the hit roll always hit body; 05 reversed 50 = body
        rollData.flags.isDamageRoll = true;
        await _rollDamage(rollData);
        await sendDamageToChat(rollData);
        // Consume ammo for skip attack roll
        await _consumeAmmo(rollData);
    } else {
        await _computeCombatTarget(rollData);
        await _rollTarget(rollData);
        rollData.attackDos = rollData.dos;
        rollData.attackResult = rollData.result;
        if (rollData.attackType) {
            _computeRateOfFire(rollData);
        }
        // Block hits if weapon jammed or overheated
        if (rollData.weaponJammed || rollData.weaponOverheated) {
            rollData.numberOfHits = 0;
        } else {
            rollData.numberOfHits = _computeNumberOfHits(
                rollData.attackDos,
                0,
                rollData.attackType,
                rollData.shotsFired,
                rollData.weapon.traits);
        }
        await _sendRollToChat(rollData);
        // Consume ammo after regular attack
        await _consumeAmmo(rollData);
    }
}

/**
 * Roll damage for an attack and post the result to chat
 * @param {object} rollData
 */
async function damageRoll(rollData) {
    // Block damage if weapon jammed or overheated
    if (rollData.weaponJammed || rollData.weaponOverheated) {
        return;
    }
    
    // For melee attacks against hordes: set numberOfHits to potential kills (DoS/2)
    // Each hit will be checked separately for armor penetration
    // Force trait doubles kills AFTER checking damage, not potential hits
    if (_isHordeTarget(rollData) && rollData.weapon?.weaponClass === "melee" && rollData.attackDos) {
        const potentialKills = Math.floor(rollData.attackDos / 2);
        rollData.numberOfHits = potentialKills;
    }
    
    await _rollDamage(rollData);
    const message = await sendDamageToChat(rollData);
    if (_shouldAutoApplyDamage(rollData)) {
        await applyAutoDamageToTarget(rollData, message);
    }
}

function _shouldAutoApplyDamage(rollData) {
    // Don't auto-apply damage for mass evasion
    if (rollData?.flags?.isMassEvasion) return false;
    
    // Don't auto-apply damage if there are multiple targets
    const targets = Array.isArray(rollData?.targets) ? rollData.targets : [];
    if (targets.length > 1) return false;
    
    // Auto-apply damage for hordes
    if (_isHordeTarget(rollData)) return true;
    
    // Auto-apply damage for single targets
    return true;
}

/**
 * Calculate required ammo for attack type based on rate of fire
 * @param {object} rollData - Roll data with weapon and attackType
 * @returns {number} - Required ammo count
 */
function _calculateRequiredAmmo(rollData) {
    const attackType = rollData.attackType?.name || "standard";
    const rateOfFire = rollData.weapon?.rateOfFire || {};
    
    // Handle modifiers for storm/twinLinked traits
    const mod = rollData.weapon?.traits?.storm || rollData.weapon?.traits?.twinLinked ? 2 : 1;
    
    switch (attackType) {
        case "standard":
        case "called_shot":
        case "bolt":
        case "blast":
            return 1;
        
        case "semi_auto":
        case "swift":
        case "barrage":
            return (Number(rateOfFire.burst) || 0) * mod;
        
        case "full_auto":
        case "lightning":
            return (Number(rateOfFire.full) || 0) * mod;
        
        case "suppression": {
            const baseShots = rollData.suppressionLength === "full"
                ? (Number(rateOfFire.full) || 0)
                : (Number(rateOfFire.burst) || 0);
            return baseShots * mod;
        }
        
        case "wide_auto": {
            const baseShots = rollData.wideRofLength === "semi"
                ? (Number(rateOfFire.burst) || 0)
                : (Number(rateOfFire.full) || 0);
            return Math.max((baseShots || 0) - 2, 0) * mod;
        }
        
        default:
            return 1;
    }
}

/**
 * Check if weapon has enough ammo for the attack
 * @param {object} rollData - Roll data with weapon and attackType
 * @returns {{enough: boolean, required: number, available: number}}
 */
function _checkAmmo(rollData) {
    // Only check for ranged weapons
    if (!rollData.weapon?.isRange) {
        return { enough: true, required: 0, available: 0 };
    }
    
    const clip = rollData.weapon?.clip || {};
    const clipValue = Number(clip.value) || 0;
    const clipMax = Number(clip.max) || 0;
    
    // If weapon has no clip system, skip check
    if (clipMax === 0) {
        return { enough: true, required: 0, available: 0 };
    }
    
    const required = _calculateRequiredAmmo(rollData);
    
    return {
        enough: clipValue >= required,
        required: required,
        available: clipValue
    };
}

/**
 * Consume ammo from weapon clip after attack
 * @param {object} rollData - Roll data with weapon and attackType
 * @returns {Promise<void>}
 */
async function _consumeAmmo(rollData) {
    // Only consume for ranged weapons
    if (!rollData.weapon?.isRange) {
        return;
    }
    
    const clip = rollData.weapon?.clip || {};
    const clipMax = Number(clip.max) || 0;
    
    // If weapon has no clip system, skip
    if (clipMax === 0) {
        return;
    }
    
    const required = _calculateRequiredAmmo(rollData);
    const currentClip = Number(clip.value) || 0;
    const newClip = Math.max(0, currentClip - required);
    
    // Get actor and weapon
    const actor = await _getActorFromOwnerId(rollData.ownerId, rollData.tokenId);
    if (!actor) {
        console.warn("Dark Heresy: _consumeAmmo - Actor not found");
        return;
    }
    
    let weapon = actor.items.get(rollData.itemId);
    
    // For token actors, if weapon not found by ID, try to find by name
    // (token items have different IDs than base actor items)
    if (!weapon && actor.isToken) {
        const weaponName = rollData.weapon?.name || rollData.name;
        if (weaponName) {
            weapon = actor.items.find(item => 
                item.type === "weapon" && item.name === weaponName
            );
        }
    }
    
    // Try UUID resolution as fallback
    if (!weapon && rollData.itemId) {
        try {
            if (rollData.itemId.includes(".")) {
                const resolved = await fromUuid(rollData.itemId);
                if (resolved && resolved.type === "weapon") {
                    // For token actors, if resolved weapon belongs to base actor, find by name in token
                    if (actor.isToken && resolved.parent?.id !== actor.id) {
                        const weaponName = resolved.name;
                        weapon = actor.items.find(item => 
                            item.type === "weapon" && item.name === weaponName
                        );
                    } else {
                        weapon = resolved;
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }
    
    if (!weapon) {
        console.warn("Dark Heresy: _consumeAmmo - Weapon not found", {
            itemId: rollData.itemId,
            weaponName: rollData.weapon?.name,
            actorId: actor.id,
            isToken: actor.isToken
        });
        return;
    }
    
    // Update clip value
    await weapon.update({"system.clip.value": newClip});
    
    // Sync for unlinked acolyte tokens
    if (actor?.isToken && actor?.type === "acolyte") {
        const isLinked = actor.prototypeToken?.actorLink ?? actor.getFlag("core", "actorLink") ?? false;
        if (!isLinked) {
            const sourceId = actor.getFlag("core", "sourceId");
            const baseActor = sourceId ? game.actors.get(sourceId) : null;
            if (baseActor) {
                const baseWeapon = baseActor.items.find(item => 
                    item.type === "weapon" && item.name === weapon.name
                );
                if (baseWeapon) {
                    await baseWeapon.update({"system.clip.value": newClip});
                }
            }
        }
    }
    
    // Update rollData
    rollData.weapon.clip.value = newClip;
}

/**
 * Reload weapon using ammunition
 * @param {DarkHeresyItem} weapon - Weapon item to reload
 * @param {string} ownerId - Actor ID
 * @param {string} tokenId - Optional token ID
 * @param {boolean} showChatMessage - Show chat message
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function _reloadWeapon(weapon, ownerId, tokenId = null, showChatMessage = true) {
    // Check if weapon has ammunition reference
    const ammunitionRef = weapon.system.ammunitionId;
    if (!ammunitionRef || ammunitionRef.trim() === "") {
        return { success: false, reason: "no_ammunition" };
    }
    
    // Get actor
    const actor = await _getActorFromOwnerId(ownerId, tokenId);
    if (!actor) {
        return { success: false, reason: "no_actor" };
    }
    
    // Find ammunition
    let ammunition = null;
    if (ammunitionRef.startsWith("Actor.") || ammunitionRef.startsWith("Item.")) {
        try {
            const resolved = await fromUuid(ammunitionRef);
            if (resolved && resolved.type === "ammunition") {
                if (actor.isToken) {
                    // For token actors, find by name
                    const ammoName = resolved.name;
                    ammunition = actor.items.find(item => 
                        item.type === "ammunition" && item.name === ammoName
                    );
                } else {
                    ammunition = resolved;
                }
            }
        } catch (e) {
            console.warn("Dark Heresy: Failed to resolve ammunition UUID:", e);
        }
    } else {
        // Try to get by ID first
        ammunition = actor.items.get(ammunitionRef);
        if (ammunition && !ammunition.isAmmunition) {
            ammunition = null;
        }
        
        // For token actors, if not found by ID, try to find by resolving from base actor and then searching by name
        if (!ammunition && actor.isToken) {
            try {
                // Try to get base actor to resolve the reference
                const sourceId = actor.getFlag("core", "sourceId");
                const baseActor = sourceId ? game.actors.get(sourceId) : null;
                if (baseActor) {
                    const baseAmmo = baseActor.items.get(ammunitionRef);
                    if (baseAmmo && baseAmmo.type === "ammunition") {
                        // Find by name in token actor
                        ammunition = actor.items.find(item => 
                            item.type === "ammunition" && item.name === baseAmmo.name
                        );
                    }
                }
            } catch (e) {
                // Ignore errors
            }
        }
    }
    
    if (!ammunition || !ammunition.isAmmunition) {
        return { success: false, reason: "no_ammunition" };
    }
    
    // Check quantity
    const quantity = Number(ammunition.system.quantity) || 0;
    if (quantity <= 0) {
        return { success: false, reason: "out_of_ammo" };
    }
    
    // Perform reload: decrease quantity by 1 and restore clip to max
    const newQuantity = Math.max(quantity - 1, 0);
    const clipMax = Number(weapon.system.clip.max) || 0;
    
    // Update ammunition and weapon
    await Promise.all([
        ammunition.update({"system.quantity": newQuantity}),
        weapon.update({"system.clip.value": clipMax})
    ]);
    
    // Sync for unlinked acolyte tokens
    if (actor?.isToken && actor?.type === "acolyte") {
        const isLinked = actor.prototypeToken?.actorLink ?? actor.getFlag("core", "actorLink") ?? false;
        if (!isLinked) {
            const sourceId = actor.getFlag("core", "sourceId");
            const baseActor = sourceId ? game.actors.get(sourceId) : null;
            if (baseActor) {
                const baseWeapon = baseActor.items.find(item => 
                    item.type === "weapon" && item.name === weapon.name
                );
                const baseAmmunition = baseActor.items.find(item => 
                    item.type === "ammunition" && item.name === ammunition.name
                );
                if (baseWeapon && baseAmmunition) {
                    await Promise.all([
                        baseAmmunition.update({"system.quantity": newQuantity}),
                        baseWeapon.update({"system.clip.value": clipMax})
                    ]);
                }
            }
        }
    }
    
    // Show chat message
    if (showChatMessage) {
        const actorName = actor.name || game.i18n.localize("ACTOR.UNKNOWN");
        await ChatMessage.create({
            user: game.user.id,
            content: `<div class="dark-heresy chat roll">
                <div class="dh-notice-card">
                    <div class="dh-notice-title">${actorName}</div>
                    <div class="dh-notice-body">${game.i18n.localize("CHAT.RELOADED") || "Перезарядил оружие"}</div>
                </div>
            </div>`
        });
    }
    
    return { success: true };
}

/**
 * Compute the target value, including all +/-modifiers, for a roll.
 * @param {object} rollData
 */
async function _computeCombatTarget(rollData) {

    let attackType = 0;
    if (rollData.attackType) {
        _computeRateOfFire(rollData);
        attackType = rollData.attackType.modifier;
    }
    let psyModifier = 0;
    if (typeof rollData.psy !== "undefined" && typeof rollData.psy.useModifier !== "undefined" && rollData.psy.useModifier) {
    // Set Current Psyrating to the allowed maximum if it is bigger
        if (rollData.psy.value > rollData.psy.max) {
            rollData.psy.value = rollData.psy.max;
        }
        
        // Calculate Psy Rating bonus: +5 per displayed rating (including 1)
        // The displayed value is already adjusted for Bound (divided by 2, rounded up)
        // e.g., displayed rating 2 = 10 bonus
        let psyBonus = rollData.psy.value * 5;
        
        // The modifier is the bonus itself (added to target)
        psyModifier = psyBonus;
        
        // Calculate push status (going above current rating)
        // Use currentRating (with sustained applied) instead of base rating
        let baseCurrentRating = rollData.psy.currentRating !== undefined ? rollData.psy.currentRating : rollData.psy.rating;
        // For Bound, compare against the current rating divided by 2 (rounded up)
        let baseDisplayedRating = baseCurrentRating;
        if (rollData.psy.class === "bound") {
            baseDisplayedRating = Math.ceil(baseCurrentRating / 2);
        }
        const pushModifier = (baseDisplayedRating - rollData.psy.value) * 10;
        rollData.psy.push = pushModifier < 0;
        
        // Store initial rating for display in chat
        rollData.psy.initialRating = baseDisplayedRating;
        rollData.psy.initialDisplayedRating = baseDisplayedRating;
        
        // For Bound: if pushing from divided-by-2 to current rating, it's "Unbrake", not "Push"
        if (rollData.psy.class === "bound" && rollData.psy.push) {
            // Check if we're pushing from divided-by-2 to exactly current rating (unbrake)
            if (rollData.psy.value === baseCurrentRating) {
                rollData.psy.isUnbrake = true;
            } else {
                rollData.psy.isUnbrake = false;
            }
        } else {
            rollData.psy.isUnbrake = false;
        }
        
        rollData.psy.actualBonus = psyBonus; // Store the actual bonus used
        
        if (rollData.psy.push && rollData.psy.warpConduit) {
            let ratingBonus = new Roll("1d5").evaluate({ async: false }).total;
            rollData.psy.value += ratingBonus;
            // Recalculate after warp conduit bonus
            psyBonus = rollData.psy.value * 5;
            psyModifier = psyBonus;
            rollData.psy.actualBonus = psyBonus;
        }
    }

    const hordeBonus = _getHordeAttackBonus(rollData);
    const difficultyMod = Number(rollData?.difficulty?.value) || 0;
    const targetConditionMod = _getTargetConditionModifier(rollData);
    const actorConditionMod = _getActorConditionModifier(game.actors.get(rollData.ownerId), rollData);
    const targetSizeMod = _getTargetSizeModifier(rollData);
    
    rollData.targetConditionModifier = targetConditionMod;
    rollData.actorConditionModifier = actorConditionMod;
    rollData.targetSizeModifier = targetSizeMod;
    
    let targetMods = rollData.target.modifier
    + (rollData.aim?.val ? rollData.aim.val : 0)
    + (rollData.rangeMod ? rollData.rangeMod : 0)
    + (rollData.weapon?.traits?.twinLinkedBonus ? 10: 0)
    + (rollData.weapon?.traits?.accurate && rollData.aim?.isAiming && rollData.weapon?.isRange ? 10: 0) // Accurate trait: +10 bonus when aiming
    + attackType
    + psyModifier
    + difficultyMod
    + hordeBonus
    + targetConditionMod
    + actorConditionMod
    + targetSizeMod;

    rollData.target.final = _getRollTarget(targetMods, rollData.target.base);
}

function _getHordeAttackBonus(rollData) {
    const target = rollData?.targets?.[0];
    if (!target || !canvas?.ready) return 0;
    if (target.sceneId && canvas.scene?.id !== target.sceneId) return 0;
    const token = canvas.tokens.get(target.tokenId);
    const hordeValue = Number(token?.actor?.system?.horde) || 0;
    if (hordeValue >= 115) return 60;
    if (hordeValue >= 85) return 50;
    if (hordeValue >= 55) return 40;
    if (hordeValue >= 25) return 30;
    return 0;
}

/**
 * Compute the target value, including all +/-modifiers, for a roll.
 * @param {object} rollData
 */
async function _computeCommonTarget(rollData) {
    const difficultyMod = Number(rollData?.difficulty?.value) || 0;
    const actor = game.actors.get(rollData.ownerId);
    const actorConditionMod = _getActorConditionModifier(actor, rollData);
    
    rollData.actorConditionModifier = actorConditionMod;
    
    if (rollData.flags.isEvasion) {
        let skill;
        switch (rollData.evasions.selected) {
            case "dodge": skill = rollData.evasions.dodge; break;
            case "parry": skill = rollData.evasions.parry; break;
            case "deny": skill = rollData.evasions.deny; break;
            case "willpower": skill = rollData.evasions.willpower; break;
            case "toughness": skill = rollData.evasions.toughness; break;
            case "agility": skill = rollData.evasions.agility; break;
            case "strength": skill = rollData.evasions.strength; break;
        }
        // Apply -10 penalty to parry if attacker's weapon is unbalanced
        let parryPenalty = 0;
        if (rollData.evasions.selected === "parry" && rollData.weapon?.traits?.unbalanced) {
            parryPenalty = -10;
        }
        rollData.target.final = _getRollTarget(rollData.target.modifier + difficultyMod + actorConditionMod + parryPenalty, skill.target.base);
    } else {
        rollData.target.final = _getRollTarget(rollData.target.modifier + difficultyMod + actorConditionMod, rollData.target.base);
    }
}

/**
 * Checks and adjusts modifiers for the rolls target number and returns the final target number
 * @param {int} targetMod calculated bonuses
 * @param {int} baseTarget the intial target value to be modified
 * @returns {int} the final target number
 */
function _getRollTarget(targetMod, baseTarget) {
    if (targetMod > 60) {
        return baseTarget + 60;
    } else if (targetMod < -60) {
        return baseTarget + -60;
    } else {
        return baseTarget + targetMod;
    }
}


/**
 * Roll a d100 against a target, and apply the result to the rollData.
 * @param {object} rollData
 */
async function _rollTarget(rollData) {
    let r = new Roll("1d100", {});
    await r.evaluate();
    let result = r.total;
    const range = _getGenderRange(rollData);
    if (range) {
        const min = range.min;
        const max = range.max;
        const secret = Math.floor(Math.random() * (max - min + 1)) + min;
        result = secret;
    }
    
    // Get unmodified dice result (original value before modifiers)
    let unmodifiedResult = result;
    if (r.terms && r.terms.length > 0 && r.terms[0].results && r.terms[0].results.length > 0) {
        // Get the first die result (unmodified)
        unmodifiedResult = r.terms[0].results[0].result;
        // Handle d100: if result is 0, it means 00 (100)
        if (unmodifiedResult === 0 && r.terms[0].faces === 100) {
            unmodifiedResult = 100;
        }
    }
    
    // Check for weapon jam and overheating for ranged weapons
    if (rollData.weapon?.isRange) {
        const traits = rollData.weapon.traits || {};
        
        // Overheating weapons don't jam, but can overheat on 91+
        if (traits.overheating) {
            if (unmodifiedResult >= 91 && unmodifiedResult <= 100) {
                const weaponName = rollData.weapon.name || game.i18n.localize("WEAPON.HEADER");
                ui.notifications.warn(game.i18n.format("WEAPON.OVERHEAT", { weapon: weaponName }));
                // Store overheating flag for chat message
                rollData.weaponOverheated = true;
            }
        } else {
            // Normal jam logic for non-overheating weapons
            let isJam = false;
            if (traits.reliable) {
                // Reliable weapons jam only on 100
                isJam = (unmodifiedResult === 100);
            } else if (traits.unreliable) {
                // Unreliable weapons jam on 91-100
                isJam = (unmodifiedResult >= 91 && unmodifiedResult <= 100);
            } else {
                // Standard weapons jam on 96-100
                isJam = (unmodifiedResult >= 96 && unmodifiedResult <= 100);
            }
            
            if (isJam) {
                const weaponName = rollData.weapon.name || game.i18n.localize("WEAPON.HEADER");
                ui.notifications.warn(game.i18n.format("WEAPON.JAM", { weapon: weaponName }));
                // Store jam flag for chat message and to block damage
                rollData.weaponJammed = true;
            }
        }
    }
    
    rollData.result = result;
    rollData.unmodifiedResult = unmodifiedResult; // Store unmodified result for reference
    rollData.rollObject = r;
    rollData.flags.isSuccess = rollData.result <= rollData.target.final;
    if (rollData.flags.isSuccess) {
        rollData.dof = 0;
        rollData.dos = 1 + _getDegree(rollData.target.final, rollData.result);
        const unnaturalBonus = _getUnnaturalDosBonus(rollData);
        rollData.unnaturalDosBonus = unnaturalBonus;
        if (unnaturalBonus > 0) {
            rollData.dos += unnaturalBonus;
        }
    } else {
        rollData.dos = 0;
        rollData.dof = 1 + _getDegree(rollData.result, rollData.target.final);
    }
    if (rollData.psy) _computePsychicPhenomena(rollData);
}

/**
 * Trigger automatic Toughness test for Shock weapon trait
 * @param {Actor} targetActor - The actor that was hit
 * @param {object} damageData - Damage data containing weapon info
 */
async function _triggerShockToughnessTest(targetActor, damageData) {
    if (!targetActor) return;
    
    const toughness = targetActor.characteristics.toughness;
    if (!toughness) return;
    
    // Create Toughness test roll data with difficulty +0 (Challenging)
    const rollData = DarkHeresyUtil.createCommonNormalRollData(targetActor, toughness);
    rollData.name = game.i18n.localize("CHARACTERISTIC.TOUGHNESS") || "Toughness";
    rollData.target.modifier = 0; // Challenging (+0)
    rollData.difficulty = { value: 0, text: game.i18n.localize("DIFFICULTY.CHALLENGING") || "Challenging" };
    
    // Perform the roll
    await _computeCommonTarget(rollData);
    await _rollTarget(rollData);
    
    // Send roll to chat
    await _sendRollToChat(rollData);
    
    // If test failed (dof > 0), apply effects
    if (rollData.dof > 0) {
        const degreesOfFailure = rollData.dof;
        
        // Apply one level of Fatigue
        const currentFatigue = Number(targetActor.fatigue.value) || 0;
        const newFatigue = Math.min(currentFatigue + 1, Number(targetActor.fatigue.max) || 0);
        await targetActor.update({ "system.fatigue.value": newFatigue });
        
        ui.notifications.info(game.i18n.format("WEAPON.SHOCK_FATIGUE_APPLIED", { 
            actor: targetActor.name
        }) || `${targetActor.name} gains 1 Fatigue from Shock weapon.`);
    }
}

function _getUnnaturalDosBonus(rollData) {
    let actorId = rollData?.ownerId;
    let characteristicKey = rollData?.characteristicKey;

    if (rollData?.flags?.isEvasion && rollData?.evasions?.selected) {
        const evasionRoll = rollData.evasions[rollData.evasions.selected];
        if (evasionRoll) {
            actorId = evasionRoll.ownerId;
            characteristicKey = evasionRoll.characteristicKey;
        }
    }

    if (!actorId || !characteristicKey) return 0;
    const actor = game.actors.get(actorId);
    const unnatural = Number(actor?.system?.characteristics?.[characteristicKey]?.unnatural) || 0;
    return Math.floor(unnatural / 2);
}
/**
 * Handle rolling and collecting parts of a combat damage roll.
 * @param {object} rollData
 */
async function _rollDamage(rollData) {
    let formula = "0";
    rollData.damages = [];
    if (rollData.weapon.damageFormula) {
        formula = rollData.weapon.damageFormula;

        if (rollData.weapon.traits.tearing) {
            formula = _appendTearing(formula);
        }
        if (rollData.weapon.traits.proven) {
            formula = _appendNumberedDiceModifier(formula, "min", rollData.weapon.traits.proven);
        }
        if (rollData.weapon.traits.primitive) {
            formula = _appendNumberedDiceModifier(formula, "max", rollData.weapon.traits.primitive);
        }

        formula = `${formula}+${rollData.weapon.damageBonus}`;
        formula = _replaceSymbols(formula, rollData);
    }

    let hordeBonusDice = Number(rollData.hordeDamageBonusDice) || 0;
    if (!rollData.hordeBonusApplied && !hordeBonusDice && rollData?.ownerId) {
        const owner = game.actors.get(rollData.ownerId);
        hordeBonusDice = _getHordeDamageBonusDiceFromActor(owner);
    }
    if (rollData.hordeBonusApplied) {
        hordeBonusDice = 0;
    }
    if (hordeBonusDice > 0) {
        formula = `${formula}+${hordeBonusDice}d10`;
    }


    let penetration = await _rollPenetration(rollData);

    let firstHit = await _computeDamage(
        formula,
        penetration,
        rollData.attackDos,
        rollData.aim?.isAiming,
        rollData.weapon.traits,
        rollData.weapon.weaponClass,
        rollData.attackType?.name
    );
    const firstLocation = (rollData.attackType?.name === "called_shot" && rollData.calledShotLocation)
        ? rollData.calledShotLocation
        : _getLocation(rollData.attackResult);
    firstHit.location = firstLocation;
    rollData.damages.push(firstHit);

    let additionalhits = rollData.numberOfHits -1;

    for (let i = 0; i < additionalhits; i++) {
        let additionalHit = await _computeDamage(
            formula,
            penetration,
            rollData.attackDos,
            rollData.aim?.isAiming,
            rollData.weapon.traits,
            rollData.weapon.weaponClass,
            rollData.attackType?.name
        );
        additionalHit.location = _getAdditionalLocation(firstLocation, i);
        rollData.damages.push(additionalHit);
    }

    let minDamage = rollData.damages.reduce(
        (min, damage) => min.minDice < damage.minDice ? min : damage, rollData.damages[0]);

    if (minDamage.minDice < rollData.dos) {
        minDamage.total += (rollData.dos - minDamage.minDice);
    }
}

function _getHordeDamageBonusDiceFromTarget(target) {
    if (!target || !canvas?.ready) return 0;
    if (target.sceneId && canvas.scene?.id !== target.sceneId) return 0;
    const token = canvas.tokens.get(target.tokenId);
    return _getHordeDamageBonusDiceFromActor(token?.actor);
}

function _getHordeDamageBonusDiceFromActor(actor) {
    const hordeValue = Number(actor?.system?.horde) || 0;
    if (hordeValue <= 0) return 0;
    return Math.min(Math.floor(hordeValue / 10), 2);
}

/**
 * Calculates the amount of hits of a successful attack
 * @param {int} attackDos Degrees of success on the Attack
 * @param {int} evasionDos Degrees of success on the Evasion
 * @param {object} attackType The mode of attack and its parameters
 * @param {int} shotsFired Number actually achiveable hits
 * @param {object} weaponTraits The traits of the weapon used for the attack
 * @returns {int}  the number of hits the attack has scrored
 */
function _computeNumberOfHits(attackDos, evasionDos, attackType, shotsFired, weaponTraits) {

    let stormMod = weaponTraits.storm ? 2 : 1;
    let maxHits = attackType.maxHits * stormMod;

    let hits = (1 + Math.floor((attackDos - 1) / attackType.hitMargin)) * stormMod;

    // For Storm weapons, max hits cannot exceed double the shots fired
    // For other weapons, max hits cannot exceed shots fired
    if (shotsFired) {
        const maxAllowedHits = shotsFired * stormMod;
        if (maxAllowedHits < maxHits) {
            maxHits = maxAllowedHits;
        }
    }

    if (hits > maxHits) {
        hits = maxHits;
    }

    hits -= evasionDos;

    // Twin-Linked X1: add one extra hit if attack hit at least once (hits > 0 after evasion)
    // This is applied after calculating base hits, so it's a bonus hit
    let twinLinkedExtraHit = 0;
    if (weaponTraits.twinLinked && hits > 0) {
        twinLinkedExtraHit = 1;
    }

    if (hits <= 0) {
        return 0;
    } else {
        // Add Twin-Linked X1 extra hit only if we have at least one hit
        return hits + twinLinkedExtraHit;
    }
}

/**
 * Roll and compute damage.
 * @param {string} damageFormula
 * @param {number} penetration
 * @param {number} dos
 * @param {boolean} isAiming
 * @param {object} weaponTraits
 * @param {string} weaponClass - Optional: weapon class (pistol, basic, heavy, etc.)
 * @param {string} attackTypeName - Optional: attack type name (standard, single, burst, full, etc.)
 * @returns {object}
 */
async function _computeDamage(damageFormula, penetration, dos, isAiming, weaponTraits, weaponClass = null, attackTypeName = null) {
    let r = new Roll(damageFormula);
    await r.evaluate();
    
    // Apply Primitive trait: limit each die result to the primitive value
    if (weaponTraits.primitive) {
        const primitiveValue = weaponTraits.primitive;
        let totalAdjustment = 0;
        r.terms.forEach(term => {
            if (typeof term === "object" && term !== null && term.results) {
                term.results?.forEach(result => {
                    if (result.active) {
                        const originalResult = result.count !== undefined ? result.count : result.result;
                        if (originalResult > primitiveValue) {
                            const adjustment = primitiveValue - originalResult;
                            totalAdjustment += adjustment;
                            // Update the result
                            if (result.count !== undefined) {
                                result.count = primitiveValue;
                            } else {
                                result.result = primitiveValue;
                            }
                        }
                    }
                });
            }
        });
        // Adjust total if needed
        if (totalAdjustment !== 0) {
            r._total = r.total + totalAdjustment;
        }
    }
    
    // Apply Proven trait: ensure each die result is at least the proven value
    // Check if proven exists and is a valid number
    if (weaponTraits && weaponTraits.proven !== undefined && weaponTraits.proven !== null && weaponTraits.proven !== false) {
        const provenValue = Number(weaponTraits.proven);
        if (!isNaN(provenValue) && provenValue > 0) {
            let totalAdjustment = 0;
            // Process all terms in the roll
            for (const term of r.terms) {
                if (term && typeof term === "object" && term.results) {
                    // Handle Die term results
                    for (const result of term.results || []) {
                        if (result && result.active !== false) {
                            // Get the actual result value
                            let currentValue = result.result;
                            if (result.count !== undefined && result.count !== null) {
                                currentValue = result.count;
                            }
                            
                            // Apply proven minimum
                            if (currentValue < provenValue) {
                                const adjustment = provenValue - currentValue;
                                totalAdjustment += adjustment;
                                
                                // Update both result and count if they exist
                                result.result = provenValue;
                                if (result.count !== undefined) {
                                    result.count = provenValue;
                                }
                            }
                        }
                    }
                }
            }
            // Adjust total if needed
            if (totalAdjustment !== 0) {
                r._total = r.total + totalAdjustment;
                // Force recalculation
                r._evaluated = true;
            }
        }
    }
    
    let damage = {
        total: r.total,
        righteousFury: 0,
        dices: [],
        penetration: penetration,
        dos: dos,
        formula: damageFormula,
        replaced: false,
        damageRender: await r.render(),
        damageRoll: r,
        weaponTraits: weaponTraits
    };

    // Accurate trait: additional damage dice for light weapons on single shot
    // Only applies to light weapons (pistol) and single/standard attacks
    if (weaponTraits.accurate && isAiming) {
        const isLightWeapon = weaponClass === "pistol";
        const isSingleShot = attackTypeName === "standard" || attackTypeName === "single" || attackTypeName === "called_shot";
        
        // Additional damage dice only for light weapons on single shot
        if (isLightWeapon && isSingleShot) {
            let numDice = ~~((dos - 1) / 2); // -1 because each degree after the first counts
            if (numDice >= 1) {
                if (numDice > 2) numDice = 2; // Maximum 2d10
                let ar = new Roll(`${numDice}d10`);
                await ar.evaluate();
                
            // Apply Primitive trait to accurate bonus dice as well
            if (weaponTraits.primitive) {
                const primitiveValue = weaponTraits.primitive;
                let accurateAdjustment = 0;
                ar.terms.flatMap(term => term.results).forEach(die => {
                    if (die.active && die.result > primitiveValue) {
                        accurateAdjustment += primitiveValue - die.result;
                        die.result = primitiveValue;
                    }
                });
                if (accurateAdjustment !== 0) {
                    ar._total = ar.total + accurateAdjustment;
                }
            }
            
            // Apply Proven trait to accurate bonus dice as well
            if (weaponTraits.proven) {
                const provenValue = weaponTraits.proven;
                let accurateAdjustment = 0;
                ar.terms.flatMap(term => term.results).forEach(die => {
                    if (die.active && die.result < provenValue) {
                        accurateAdjustment += provenValue - die.result;
                        die.result = provenValue;
                    }
                });
                if (accurateAdjustment !== 0) {
                    ar._total = ar.total + accurateAdjustment;
                }
            }
                
                damage.total += ar.total;
                ar.terms.flatMap(term => term.results).forEach(async die => {
                    if (die.active && die.result < dos) damage.dices.push(die.result);
                    if (die.active && (typeof damage.minDice === "undefined" || die.result < damage.minDice)) damage.minDice = die.result;
                });
                damage.accurateRender = await ar.render();
            }
        }
    }

    r.terms.forEach(term => {
        if (typeof term === "object" && term !== null) {
            let rfFace = weaponTraits.rfFace ? weaponTraits.rfFace : term.faces; // Without the Vengeful weapon trait rfFace is undefined
            term.results?.forEach(async result => {
                let dieResult = result.count ? result.count : result.result; // Result.count = actual value if modified by term
                if (result.active && dieResult >= rfFace) damage.righteousFury = await _rollRighteousFury();
                if (result.active && dieResult < dos) damage.dices.push(dieResult);
                if (result.active && (typeof damage.minDice === "undefined" || dieResult < damage.minDice)) damage.minDice = dieResult;
            });
        }
    });
    return damage;
}


/**
 * Get actor from ownerId, handling both regular actors and token actors
 * @param {string} ownerId - Actor ID or token ID
 * @param {string} tokenId - Optional token ID from rollData
 * @returns {Promise<Actor|null>} - The actor or null if not found
 */
async function _getActorFromOwnerId(ownerId, tokenId = null) {
    if (!ownerId) return null;
    
    // PRIORITY: If tokenId is provided, get token actor FIRST (for unlinked tokens)
    // This ensures we work with the token actor, not the base actor
    if (tokenId) {
        const scene = game.scenes.active || canvas?.scene;
        const token = scene?.tokens?.get(tokenId);
        if (token?.actor) {
            return token.actor; // Return token actor immediately
        }
    }
    
    // Try to get actor directly from game.actors
    let actor = game.actors.get(ownerId);
    
    // If actor found and it's NOT a token actor, check if we should get token instead
    // For unlinked tokens, we want the token actor, not the base actor
    if (actor && !actor.isToken && tokenId) {
        const scene = game.scenes.active || canvas?.scene;
        const token = scene?.tokens?.get(tokenId);
        if (token?.actor) {
            return token.actor; // Prefer token actor over base actor
        }
    }
    
    // If not found, try to get from token (ownerId might be token ID)
    if (!actor) {
        const scene = game.scenes.active || canvas?.scene;
        const tokenIdToCheck = tokenId || ownerId;
        const token = scene?.tokens?.get(tokenIdToCheck);
        if (token?.actor) {
            actor = token.actor;
        }
    }
    
    // If still not found, try to resolve as UUID
    if (!actor && ownerId.includes(".")) {
        try {
            const resolved = await fromUuid(ownerId);
            if (resolved) {
                // If resolved is a token, get its actor
                if (resolved.documentName === "Token") {
                    actor = resolved.actor;
                } else if (resolved.documentName === "Actor") {
                    actor = resolved;
                    // If we have tokenId, prefer token actor over resolved base actor
                    if (tokenId && actor && !actor.isToken) {
                        const scene = game.scenes.active || canvas?.scene;
                        const token = scene?.tokens?.get(tokenId);
                        if (token?.actor) {
                            actor = token.actor;
                        }
                    }
                } else {
                    actor = resolved.actor || resolved;
                }
            }
        } catch (e) {
            // Ignore UUID resolution errors
        }
    }
    
    return actor;
}


/**
 * Evaluate final penetration, by leveraging the dice roll API.
 * @param {object} rollData
 * @returns {number}
 */
async function _rollPenetration(rollData) {
    let penetration = (rollData.weapon.penetrationFormula) ? _replaceSymbols(rollData.weapon.penetrationFormula, rollData) : "0";
    let multiplier = 1;

    // Use attackDos if available, otherwise fall back to dos
    const dos = rollData.attackDos !== undefined ? rollData.attackDos : rollData.dos;
    
    if (dos >= 3) {
        if (penetration.includes("(")) // Legacy Support
        {
            let rsValue = penetration.match(/\(\d+\)/gi); // Get Razorsharp Value
            if (rsValue && rsValue.length > 0) {
                penetration = penetration.replace(/\d+.*\(\d+\)/gi, rsValue[0]); // Replace construct BaseValue(RazorsharpValue) with the extracted value
            }
        } else if (rollData.weapon.traits.razorSharp) {
            multiplier = 2;
        }
    }
    let r = new Roll(penetration.toString());
    await r.evaluate();
    return r.total * multiplier;
}

/**
 * Roll a Righteous Fury dice, and return the value.
 * @returns {number}
 */
async function _rollRighteousFury() {
    let r = new Roll("1d5");
    await r.evaluate();
    return r.total;
}

/**
 * Check for psychic phenomena (i.e, the user rolled two matching numbers, etc.), and add the result to the rollData.
 * @param {object} rollData
 */
function _computePsychicPhenomena(rollData) {
    // For Bound characters using Psy Rating divided by 2 (not pushing), no phenomena occur
    if (rollData.psy.class === "bound" && !rollData.psy.push) {
        rollData.psy.hasPhenomena = false;
    } else {
        // For all classes when pushing (or Unbound/Daemonic not pushing), phenomena occur only on doubles
        rollData.psy.hasPhenomena = _isDouble(rollData.result);
    }
    
    // If Unbound and a double is rolled, mark as unbound status
    if (rollData.psy.class === "unbound" && _isDouble(rollData.result)) {
        rollData.psy.isUnbound = true;
    } else {
        rollData.psy.isUnbound = false;
    }
}

/**
 * Check if a number (d100 roll) has two matching digits.
 * @param {number} number
 * @returns {boolean}
 */
function _isDouble(number) {
    if (number === 100) {
        return true;
    } else {
        const digit = number % 10;
        return number - digit === digit * 10;
    }
}

/**
 * Get the hit location from a WS/BS roll.
 * @param {number} result
 * @returns {string}
 */
function _getLocation(result) {
    const toReverse = result < 10 ? `0${result}` : result.toString();
    const locationTarget = parseInt(toReverse.split("").reverse().join(""));
    if (locationTarget <= 10) {
        return "ARMOUR.HEAD";
    } else if (locationTarget <= 20) {
        return "ARMOUR.RIGHT_ARM";
    } else if (locationTarget <= 30) {
        return "ARMOUR.LEFT_ARM";
    } else if (locationTarget <= 70) {
        return "ARMOUR.BODY";
    } else if (locationTarget <= 85) {
        return "ARMOUR.RIGHT_LEG";
    } else if (locationTarget <= 100) {
        return "ARMOUR.LEFT_LEG";
    } else {
        return "ARMOUR.BODY";
    }
}

/**
 * Calculate modifiers/etc. from RoF type, and add them to the rollData.
 * @param {object} rollData
 */
function _computeRateOfFire(rollData) {
    switch (rollData.attackType.name) {
        case "standard":
            rollData.attackType.modifier = 10;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        case "bolt":
        case "blast":
            rollData.attackType.modifier = 0;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;
        case "wide_auto":
            rollData.attackType.modifier = 0;
            rollData.evasionModifier = -20;
            if (rollData.wideRofLength === "semi") {
                rollData.attackType.hitMargin = 2;
                rollData.attackType.maxHits = Math.max((rollData.weapon.rateOfFire.burst || 0) - 2, 0);
                rollData.attackType.text = game.i18n.localize("ATTACK_TYPE.WIDE_SEMI");
                rollData.attackType.length = "semi";
            } else {
                rollData.attackType.modifier = -10;
                rollData.attackType.hitMargin = 1;
                rollData.attackType.maxHits = Math.max((rollData.weapon.rateOfFire.full || 0) - 2, 0);
                rollData.attackType.text = game.i18n.localize("ATTACK_TYPE.WIDE_FULL");
                rollData.attackType.length = "full";
            }
            break;

        case "swift":
        case "semi_auto":
        case "barrage":
            rollData.attackType.modifier = 0;
            rollData.attackType.hitMargin = 2;
            rollData.attackType.maxHits = rollData.weapon.rateOfFire.burst;
            break;
        case "suppression":
            rollData.attackType.modifier = -20;
            rollData.attackType.hitMargin = 2;
            rollData.evasionModifier = 0;
            if (rollData.suppressionLength === "full") {
                rollData.attackType.maxHits = rollData.weapon.rateOfFire.full;
                rollData.attackType.text = game.i18n.localize("ATTACK_TYPE.SUPPRESSION_FULL");
                rollData.attackType.length = "full";
            } else {
                rollData.attackType.maxHits = rollData.weapon.rateOfFire.burst;
                rollData.attackType.text = game.i18n.localize("ATTACK_TYPE.SUPPRESSION_SEMI");
                rollData.attackType.length = "semi";
            }
            break;

        case "lightning":
        case "full_auto":
            rollData.attackType.modifier = -10;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = rollData.weapon.rateOfFire.full;
            break;

        case "called_shot":
            rollData.attackType.modifier = -20;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        case "charge":
            rollData.attackType.modifier = 20;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        case "allOut":
            rollData.attackType.modifier = 30;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        default:
            rollData.attackType.modifier = 0;
            rollData.attackType.hitMargin = 0;
            rollData.attackType.maxHits = 1;
            break;
    }
}

const additionalHit = {
    head: ["ARMOUR.HEAD", "ARMOUR.RIGHT_ARM", "ARMOUR.BODY", "ARMOUR.LEFT_ARM", "ARMOUR.BODY"],
    rightArm: ["ARMOUR.RIGHT_ARM", "ARMOUR.RIGHT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY", "ARMOUR.RIGHT_ARM"],
    leftArm: ["ARMOUR.LEFT_ARM", "ARMOUR.LEFT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY", "ARMOUR.LEFT_ARM"],
    body: ["ARMOUR.BODY", "ARMOUR.RIGHT_ARM", "ARMOUR.HEAD", "ARMOUR.LEFT_ARM", "ARMOUR.BODY"],
    rightLeg: ["ARMOUR.RIGHT_LEG", "ARMOUR.BODY", "ARMOUR.RIGHT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY"],
    leftLeg: ["ARMOUR.LEFT_LEG", "ARMOUR.BODY", "ARMOUR.LEFT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY"]
};

/**
 * Get successive hit locations for an attack which scored multiple hits.
 * @param {string} firstLocation
 * @param {number} numberOfHit
 * @returns {string}
 */
function _getAdditionalLocation(firstLocation, numberOfHit) {
    if (firstLocation === "ARMOUR.HEAD") {
        return _getLocationByIt(additionalHit.head, numberOfHit);
    } else if (firstLocation === "ARMOUR.RIGHT_ARM") {
        return _getLocationByIt(additionalHit.rightArm, numberOfHit);
    } else if (firstLocation === "ARMOUR.LEFT_ARM") {
        return _getLocationByIt(additionalHit.leftArm, numberOfHit);
    } else if (firstLocation === "ARMOUR.BODY") {
        return _getLocationByIt(additionalHit.body, numberOfHit);
    } else if (firstLocation === "ARMOUR.RIGHT_LEG") {
        return _getLocationByIt(additionalHit.rightLeg, numberOfHit);
    } else if (firstLocation === "ARMOUR.LEFT_LEG") {
        return _getLocationByIt(additionalHit.leftLeg, numberOfHit);
    } else {
        return _getLocationByIt(additionalHit.body, numberOfHit);
    }
}

/**
 * Lookup hit location from array.
 * @param {Array} part
 * @param {number} numberOfHit
 * @returns {string}
 */
function _getLocationByIt(part, numberOfHit) {
    const index = numberOfHit > (part.length - 1) ? part.length - 1 : numberOfHit;
    return part[index];
}


/**
 * Get degrees of success/failure from a target and a roll.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function _getDegree(a, b) {
    return Math.floor((a - b) / 10);
}
/**
 * Replaces all Symbols in the given Formula with their Respective Values
 * The Symbols consist of Attribute Boni and Psyrating
 * @param {*} formula
 * @param {*} rollData
 * @returns {string}
 */
function _replaceSymbols(formula, rollData) {
    let actor = game.actors.get(rollData.ownerId);
    let attributeBoni = actor?.attributeBoni || rollData.attributeBoni || [];
    const psyValue = rollData.psy ? (Number(rollData.psy.value) || 0) : 0;
    const psyBonus = psyValue;
    // Always replace psy symbols to avoid unresolved StringTerm errors
    formula = formula.replaceAll(/PR/gi, psyValue);
    formula = formula.replaceAll(/PP/gi, psyBonus);
    for (let boni of attributeBoni) {
        formula = formula.replaceAll(boni.regex, boni.value);
    }
    return formula;
}

function _getGenderRange(rollData) {
    const actor = game.actors.get(rollData?.ownerId);
    const gender = actor?.system?.bio?.gender;
    switch (gender) {
        case "D0mintarN0siliya":
            return { min: 1, max: 10 };
        case "Gendern0fluid":
            return { min: 10, max: 30 };
        case "Pen1smaster":
            return { min: 10, max: 50 };
        default:
            return null;
    }
}

/**
 * Add a special weapon modifier value to a roll formula.
 * @param {string} formula
 * @param {string} modifier
 * @param {number} value
 * @returns {string}
 */
function _appendNumberedDiceModifier(formula, modifier, value) {
    let diceRegex = /\d+d\d+/;
    if (!formula.includes(modifier)) {
        let match = formula.match(diceRegex);
        if (match) {
            let dice = match[0];
            dice += `${modifier}${value}`;
            formula = formula.replace(diceRegex, dice);
        }
    }
    return formula;
}

/**
 * Add the "tearing" special weapon modifier to a roll formula.
 * @param {string} formula
 * @returns {string}
 */
function _appendTearing(formula) {
    let diceRegex = /\d+d\d+/;
    if (!formula.match(/dl|kh/gi, formula)) { // Already has drop lowest or keep highest
        let match = formula.match(/\d+/g, formula);
        let numDice = parseInt(match[0]) + 1;
        let faces = parseInt(match[1]);
        let diceTerm = `${numDice}d${faces}dl`;
        formula = formula.replace(diceRegex, diceTerm);
    }
    return formula;
}

function _normalizeDamageType(value) {
    if (!value) return "impact";
    const normalized = value.toString().toLowerCase();
    const map = {
        e: "energy",
        i: "impact",
        r: "rending",
        x: "explosive"
    };
    if (map[normalized]) return map[normalized];
    if (["energy", "impact", "rending", "explosive"].includes(normalized)) return normalized;
    return "impact";
}

/**
 * Post a roll to chat.
 * @param {object} rollData
 */
async function _sendRollToChat(rollData) {
    if (rollData?.flags?.isAttack) {
        const targets = Array.isArray(rollData.targets) ? rollData.targets : [];
        if (!targets.length) {
            const currentTargets = DarkHeresyUtil.getCurrentTargets();
            if (currentTargets.length) rollData.targets = currentTargets;
        }
        rollData.flags.hasMultipleTargets = Array.isArray(rollData.targets)
            && rollData.targets.length > 1;
    }
    await _sendSingleRollToChat(rollData);
}

async function _sendSingleRollToChat(rollData) {
    let speaker = ChatMessage.getSpeaker();
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        speaker: speaker,
        flags: {
            "dark-heresy.rollData": rollData
        }
    };

    if (speaker.token) {
        rollData.tokenId = speaker.token;
    }

    if (rollData.rollObject && typeof rollData.rollObject.render === "function") {
        rollData.render = await rollData.rollObject.render();
        chatData.rolls = [rollData.rollObject];
    } else {
        delete rollData.rollObject;
    }

    if (rollData.attackType?.name === "none") {
        rollData.attackType = null;
    }
    if (rollData?.flags?.isAttack) {
        if (rollData.rangeMod === undefined || rollData.rangeMod === null) {
            rollData.rangeMod = 0;
        }
        if (!rollData.rangeModText) {
            rollData.rangeModText = game.i18n.localize("RANGE.NONE");
        }
    }

    let html;
    if (rollData.flags.isEvasion) {
            html = await renderTemplate("systems/dark-heresy/template/chat/evasion.hbs", rollData);
    } else {
        html = await renderTemplate("systems/dark-heresy/template/chat/roll.hbs", rollData);
    }
    chatData.content = html;

    if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user];
    }

    ChatMessage.create(chatData);
}
/**
 * Post rolled damage to chat.
 * @param {object} rollData
 */
async function sendDamageToChat(rollData) {
    let speaker = ChatMessage.getSpeaker();
    rollData.canRevert = _canManageDamageRevert();
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        speaker: speaker,
        flags: {
            "dark-heresy.rollData": rollData
        }
    };

    if (speaker.token) {
        rollData.tokenId = speaker.token;
    }

    const actor = rollData.ownerId ? game.actors.get(rollData.ownerId) : null;
    const item = actor?.items?.get(rollData.itemId);
    if (!rollData.weapon) rollData.weapon = {};
    if (!rollData.weapon.damageType || rollData.weapon.damageType === "none") {
        const fallbackType = item?.damageType
            || item?.system?.damageType
            || item?.system?.damage?.type;
        rollData.weapon.damageType = _normalizeDamageType(fallbackType);
    } else {
        rollData.weapon.damageType = _normalizeDamageType(rollData.weapon.damageType);
    }

    chatData.rolls = rollData.damages.flatMap(r => r.damageRoll);

    const html = await renderTemplate("systems/dark-heresy/template/chat/damage.hbs", rollData);
    chatData.content = html;

    if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user];
    }

    return ChatMessage.create(chatData);
}


/**
 * Show a generic roll dialog.
 * @param {object} rollData
 */
async function prepareCommonRoll(rollData) {
    if (rollData.difficulty && typeof rollData.difficulty === "object") {
        rollData.difficulty = rollData.difficulty.value ?? 0;
    } else if (rollData.difficulty === undefined || rollData.difficulty === null) {
        rollData.difficulty = 0;
    }
    const html = await renderTemplate("systems/dark-heresy/template/dialog/common-roll.hbs", rollData);
    let dialog = new Dialog({
        title: game.i18n.localize(rollData.name),
        content: html,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    if (rollData.flags?.isEvasion) {
                        const skill = html.find("#selectedSkill")[0];
                        if (skill) {
                            rollData.name = game.i18n.localize(skill.options[skill.selectedIndex].text);
                            rollData.evasions.selected = skill.value;
                        }
                    } else {
                        rollData.name = game.i18n.localize(rollData.name);
                        const selectedOption = html.find("[name=characteristic] :selected");
                        if (selectedOption.length) {
                            rollData.target.base = parseInt(selectedOption.data("target"), 10);
                            rollData.rolledWith = selectedOption.text();
                            rollData.characteristicKey = selectedOption.val();
                        } else {
                        rollData.target.base = parseInt(html.find("#target")[0].value, 10);
                        }
                    }
                    rollData.target.modifier = parseInt(html.find("#modifier")[0].value, 10);
                    const difficulty = html.find("#difficulty")[0];
                    if (difficulty) {
                        const selectedOption = difficulty.options[difficulty.selectedIndex];
                        rollData.difficulty = {
                            value: parseInt(difficulty.value, 10) || 0,
                            text: $(selectedOption).data("baseText") || selectedOption.text
                        };
                    } else {
                        rollData.difficulty = { value: 0, text: game.i18n.localize("DIFFICULTY.CHALLENGING") };
                    }
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = false;
                    await commonRoll(rollData);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }

        },
        default: "roll",
        close: () => {},
        render: html => {
            const formatSigned = value => {
                const num = Number(value) || 0;
                if (num > 0) return `+${num}`;
                if (num < 0) return `${num}`;
                return "0";
            };
            const setOptionLabels = (select, getSuffix) => {
                if (!select?.length) return;
                select.find("option").each((_, opt) => {
                    const option = $(opt);
                    const baseText = option.data("baseText") || option.text();
                    option.data("baseText", baseText);
                    const suffix = getSuffix(option.val(), baseText, option);
                    option.text(suffix ? `${baseText} (${suffix})` : baseText);
                });
            };
            const sel = html.find("select[name=characteristic");
            const target = html.find("#target");
            sel.change(() => {
                const selectedOption = sel.find(":selected");
                target.val(selectedOption.data("target"));
            });
            const initialOption = sel.find(":selected");
            if (initialOption.length) {
                target.val(initialOption.data("target"));
            }
            setOptionLabels(html.find("#difficulty"), value => formatSigned(value));
        }
    }, {
        width: 200
    });
    dialog.render(true);
}

function _promptCalledShotLocation(selected) {
    const locations = [
        Dh.hitLocations.head,
        Dh.hitLocations.body,
        Dh.hitLocations.leftArm,
        Dh.hitLocations.rightArm,
        Dh.hitLocations.leftLeg,
        Dh.hitLocations.rightLeg
    ];
    const options = locations
        .map(loc => {
            const label = game.i18n.localize(loc);
            const isSelected = selected === loc ? "selected" : "";
            return `<option value="${loc}" ${isSelected}>${label}</option>`;
        })
        .join("");
    const content = `
        <div class="dark-heresy dialog">
            <div class="flex row wrap background border" style="flex-basis:100%;margin-bottom:5px">
                <div class="wrapper">
                    <label>${game.i18n.localize("CHAT.TARGET")}</label>
                    <select id="called-shot-location">
                        ${options}
                    </select>
                </div>
            </div>
        </div>
    `;
    return new Promise(resolve => {
        const dialog = new Dialog({
            title: "Called Shot",
            content,
            buttons: {
                select: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTON.APPLY") || "Apply",
                    callback: html => {
                        const value = html.find("#called-shot-location")[0]?.value;
                        resolve(value || null);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTON.CANCEL"),
                    callback: () => resolve(null)
                }
            },
            default: "select",
            close: () => resolve(null)
        }, { width: 240 });
        dialog.render(true);
    });
}

/**
 * Calculate distance between two tokens in meters
 * @param {Token} token1 - First token
 * @param {Token} token2 - Second token
 * @returns {number} Distance in meters
 */
function _calculateTokenDistanceInMeters(token1, token2) {
    if (!token1 || !token2 || !canvas?.ready || !canvas?.grid) return null;
    
    // Get grid configuration
    const gridConfig = canvas.scene?.grid;
    if (!gridConfig) return null;
    
    // Get token center coordinates - use getCenter() method if available (like in other parts of the code)
    const center1 = token1.center || (token1.getCenter ? token1.getCenter() : null);
    const center2 = token2.center || (token2.getCenter ? token2.getCenter() : null);
    
    if (!center1 || !center2) {
        console.error("[Dark Heresy Distance] Cannot get token centers", { 
            token1HasCenter: !!token1.center, 
            token1HasGetCenter: !!token1.getCenter,
            token2HasCenter: !!token2.center,
            token2HasGetCenter: !!token2.getCenter
        });
        return null;
    }
    
    const x1 = center1.x;
    const y1 = center1.y;
    const x2 = center2.x;
    const y2 = center2.y;
    
    // Calculate distance using token center coordinates
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
    
    // Get grid size in pixels (size of one grid square)
    const gridSize = gridConfig.size || 100; // Default 100 pixels per grid square
    
    // Calculate distance in grid units
    const distanceInGridUnits = distanceInPixels / gridSize;
    
    // Get grid unit size and type
    const gridUnitSize = gridConfig.distance || 5; // Size of one grid unit in scene units
    const gridUnits = gridConfig.units || "ft"; // Unit type (ft, m, etc.)
    
    // Convert to meters based on grid units
    let distanceInMeters;
    if (gridUnits.toLowerCase().includes("meter") || gridUnits.toLowerCase().includes("m")) {
        // Grid is already in meters
        distanceInMeters = distanceInGridUnits * gridUnitSize;
    } else if (gridUnits.toLowerCase().includes("foot") || gridUnits.toLowerCase().includes("ft")) {
        // Grid is in feet, convert to meters (1 foot = 0.3048 meters)
        distanceInMeters = distanceInGridUnits * gridUnitSize * 0.3048;
    } else {
        // Default: assume feet if unknown
        distanceInMeters = distanceInGridUnits * gridUnitSize * 0.3048;
    }
    
    return distanceInMeters;
}

/**
 * Automatically determine range modifier based on distance and weapon range
 * @param {object} rollData - Roll data containing weapon and targets
 * @param {DarkHeresyActor} actorRef - Actor making the attack
 * @returns {object} Object with rangeMod (number) and rangeModText (string)
 */
function _determineRangeModifier(rollData, actorRef) {
    // Only for ranged weapons
    if (!rollData?.weapon?.isRange || !rollData?.weapon?.range) {
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    // Need at least one target
    if (!rollData?.targets?.length) {
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    const target = rollData.targets[0];
    if (!target || !canvas?.ready) {
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    // Get actor's token (the one making the attack)
    // We need the actual Token object on the canvas, not TokenDocument
    let actorToken = null;
    
    // Method 1: Find token by actor ID on current scene (most reliable)
    if (actorRef?.id) {
        const tokens = canvas.tokens?.placeables?.filter(t => t.actor?.id === actorRef.id);
        if (tokens && tokens.length > 0) {
            actorToken = tokens[0];
        }
    }
    
    // Method 2: Try to find token by ownerId from rollData
    if (!actorToken && rollData?.ownerId) {
        const tokens = canvas.tokens?.placeables?.filter(t => t.actor?.id === rollData.ownerId);
        if (tokens && tokens.length > 0) {
            actorToken = tokens[0];
        }
    }
    
    // Method 3: If actorRef has token document, try to get Token from canvas
    if (!actorToken && actorRef?.token) {
        const tokenDoc = actorRef.token;
        // If tokenDoc has an id, get the actual Token from canvas
        if (tokenDoc.id) {
            actorToken = canvas.tokens?.get(tokenDoc.id);
        }
    }
    
    // Method 4: Fallback to controlled token
    if (!actorToken && canvas.tokens?.controlled?.length > 0) {
        actorToken = canvas.tokens.controlled[0];
    }
    
    // Verify we have a valid Token object (not TokenDocument)
    if (!actorToken) {
        console.warn("[Dark Heresy Range] Cannot find actor token on canvas");
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    // Verify token is a Token object (has center or getCenter method)
    const hasCenter = actorToken.center !== undefined;
    const hasGetCenter = actorToken.getCenter && typeof actorToken.getCenter === 'function';
    if (!hasCenter && !hasGetCenter) {
        console.warn("[Dark Heresy Range] Actor token is not a valid Token object", {
            tokenType: actorToken.constructor?.name,
            hasCenter,
            hasGetCenter,
            token: actorToken
        });
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    // Get target token
    const targetToken = canvas.tokens.get(target.tokenId);
    if (!targetToken || targetToken.scene?.id !== canvas.scene?.id) {
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    // Calculate distance in meters
    const distanceInMeters = _calculateTokenDistanceInMeters(actorToken, targetToken);
    if (distanceInMeters === null) {
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    const weaponRange = Number(rollData.weapon.range) || 0;
    if (weaponRange <= 0) {
        return { rangeMod: 0, rangeModText: game.i18n.localize("RANGE.NONE") };
    }
    
    // Determine range category based on rules:
    // Order matters - check from most specific to least specific
    
    // 1. Point Blank: exactly 2 meters or less (highest priority, checked first)
    // This takes precedence over all other range calculations
    if (distanceInMeters <= 2.0) {
        return { 
            rangeMod: 30, 
            rangeModText: game.i18n.localize("RANGE.POINT_BLANK") 
        };
    }
    
    // All checks below are for distances > 2 meters
    const halfRange = weaponRange / 2;
    const doubleRange = weaponRange * 2;
    const tripleRange = weaponRange * 3;
    
    // 2. Extreme: three times weapon range or more
    if (distanceInMeters >= tripleRange) {
        return { 
            rangeMod: -30, 
            rangeModText: game.i18n.localize("RANGE.EXTREME") 
        };
    }
    
    // 3. Long: more than double weapon range (but less than triple)
    if (distanceInMeters > doubleRange) {
        return { 
            rangeMod: -10, 
            rangeModText: game.i18n.localize("RANGE.LONG") 
        };
    }
    
    // 4. Short: less than half weapon range (but more than 2 meters)
    if (distanceInMeters < halfRange) {
        return { 
            rangeMod: 10, 
            rangeModText: game.i18n.localize("RANGE.SHORT") 
        };
    }
    
    // Default: between half and double range - also Short range
    // (This covers the case where distance >= halfRange and <= doubleRange, and > 2 meters)
    return { 
        rangeMod: 10, 
        rangeModText: game.i18n.localize("RANGE.SHORT") 
    };
}

/**
 * Show a combat roll dialog.
 * @param {object} rollData
 * @param {DarkHeresyActor} actorRef
 */
async function prepareCombatRoll(rollData, actorRef) {
    rollData.wideRofLength = rollData.wideRofLength || "semi";
    rollData.suppressionLength = rollData.suppressionLength || "semi";
    
    // Automatically determine range modifier for ranged weapons
    if (rollData?.weapon?.isRange && rollData?.targets?.length > 0) {
        const autoRange = _determineRangeModifier(rollData, actorRef);
        rollData.rangeMod = autoRange.rangeMod;
        rollData.rangeModText = autoRange.rangeModText;
    } else {
        // Default to None if not ranged or no targets
        rollData.rangeMod = rollData.rangeMod || 0;
        rollData.rangeModText = rollData.rangeModText || game.i18n.localize("RANGE.NONE");
    }
    
    const html = await renderTemplate("systems/dark-heresy/template/dialog/combat-roll.hbs", rollData);
    let dialog = new Dialog({
            title: rollData.name,
            content: html,
            buttons: {
                roll: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTON.ROLL"),
                    callback: async html => {
                        rollData.name = game.i18n.localize(rollData.name);
                        const getBaseText = option => ($(option).data("baseText") || option.text);
                        rollData.target.base = parseInt(html.find("#target")[0]?.value, 10);
                        rollData.target.modifier = parseInt(html.find("#modifier")[0]?.value, 10);
                        const range = html.find("#range")[0];
                        if (range) {
                            rollData.rangeMod = parseInt(range.value, 10);
                            rollData.rangeModText = getBaseText(range.options[range.selectedIndex]);
                        }

                        const attackType = html.find("#attackType")[0];
                        rollData.attackType = {
                            name: attackType?.value,
                            text: getBaseText(attackType?.options[attackType.selectedIndex]),
                            modifier: 0
                        };
                        if (attackType?.value === "wide_auto") {
                            const wideRofLength = html.find("#wideRofLength")[0];
                            if (wideRofLength) {
                                rollData.wideRofLength = wideRofLength.value;
                                rollData.wideRofLengthText = wideRofLength.options[wideRofLength.selectedIndex].text;
                            }
                        }
                        if (attackType?.value === "suppression") {
                            const suppressionLength = html.find("#suppressionLength")[0];
                            if (suppressionLength) {
                                rollData.suppressionLength = suppressionLength.value;
                                rollData.suppressionLengthText = suppressionLength.options[suppressionLength.selectedIndex].text;
                            }
                        }
                    if (rollData.attackType.name === "called_shot") {
                        const calledShotLocation = await _promptCalledShotLocation(rollData.calledShotLocation);
                        if (!calledShotLocation) return;
                        rollData.calledShotLocation = calledShotLocation;
                    }

                        const aim = html.find("#aim")[0];
                        rollData.aim = {
                            val: parseInt(aim?.value, 10),
                            isAiming: aim?.value !== "0",
                            text: getBaseText(aim?.options[aim.selectedIndex])
                        };

                        if (rollData.weapon.traits.inaccurate) {
                            rollData.aim.val=0;
                        }
                        // Note: Accurate trait bonus (+10) is applied in _computeCombatTarget() to avoid double counting

                        rollData.weapon.damageFormula = html.find("#damageFormula")[0].value.replace(" ", "");
                        rollData.weapon.damageType = html.find("#damageType")[0].value;
                        rollData.weapon.damageBonus = parseInt(html.find("#damageBonus")[0].value, 10);
                        rollData.weapon.penetrationFormula = html.find("#penetration")[0].value;
                        rollData.flags.isDamageRoll = false;
                        rollData.flags.isCombatRoll = true;
                        // Refresh targets right before the roll to capture current selection
                        const currentTargets = DarkHeresyUtil.getCurrentTargets();
                        rollData.targets = currentTargets.length ? [currentTargets[0]] : undefined;

                        if (rollData.weapon.traits.skipAttackRoll) {
                            rollData.attackType.name = "standard";
                        }

                        // Sync clip from database before checking ammo
                        if (rollData.weapon.isRange) {
                            const actor = await _getActorFromOwnerId(rollData.ownerId, rollData.tokenId);
                            if (actor) {
                                let currentWeapon = actor.items.get(rollData.itemId);
                                
                                // For token actors, if weapon not found by ID, try to find by name
                                if (!currentWeapon && actor.isToken) {
                                    const weaponName = rollData.weapon?.name || rollData.name;
                                    if (weaponName) {
                                        currentWeapon = actor.items.find(item => 
                                            item.type === "weapon" && item.name === weaponName
                                        );
                                    }
                                }
                                
                                if (currentWeapon) {
                                    const dbClip = currentWeapon.clip || {};
                                    rollData.weapon.clip = {
                                        value: Number(dbClip.value) || 0,
                                        max: Number(dbClip.max) || 0
                                    };
                                }
                            }
                        }

                        // Check ammo before attack
                        const ammoCheck = _checkAmmo(rollData);
                        if (!ammoCheck.enough && rollData.weapon.isRange && rollData.weapon.clip.max > 0) {
                            // Not enough ammo - offer reload
                            const actor = await _getActorFromOwnerId(rollData.ownerId, rollData.tokenId);
                            if (!actor) {
                                console.warn("Dark Heresy: prepareCombatRoll - Actor not found for reload");
                                return;
                            }
                            
                            let weapon = actor.items.get(rollData.itemId);
                            
                            // For token actors, if weapon not found by ID, try to find by name
                            if (!weapon && actor.isToken) {
                                const weaponName = rollData.weapon?.name || rollData.name;
                                if (weaponName) {
                                    weapon = actor.items.find(item => 
                                        item.type === "weapon" && item.name === weaponName
                                    );
                                }
                            }
                            
                            if (weapon) {
                                const messageText = game.i18n.format("DIALOG.RELOAD_MESSAGE", {
                                    required: ammoCheck.required,
                                    available: ammoCheck.available
                                }) || `Недостаточно патронов для выстрела. Требуется: ${ammoCheck.required}, доступно: ${ammoCheck.available}. Перезарядить оружие?`;
                                
                                const reloadDialog = new Dialog({
                                    title: game.i18n.localize("DIALOG.RELOAD_TITLE") || "Недостаточно патронов",
                                    content: `
                                        <div class="dark-heresy dialog">
                                            <p>${messageText}</p>
                                        </div>
                                    `,
                                    buttons: {
                                        reload: {
                                            icon: '<i class="fas fa-check"></i>',
                                            label: game.i18n.localize("BUTTON.RELOAD") || "Перезарядить",
                                            callback: async () => {
                                                const reloadResult = await _reloadWeapon(weapon, rollData.ownerId, rollData.tokenId, true);
                                                
                                                if (reloadResult.success) {
                                                    // Update rollData with new clip value
                                                    const updatedActor = await _getActorFromOwnerId(rollData.ownerId, rollData.tokenId);
                                                    if (updatedActor) {
                                                        let updatedWeapon = updatedActor.items.get(rollData.itemId);
                                                        
                                                        // For token actors, if weapon not found by ID, try to find by name
                                                        if (!updatedWeapon && updatedActor.isToken) {
                                                            const weaponName = rollData.weapon?.name || rollData.name;
                                                            if (weaponName) {
                                                                updatedWeapon = updatedActor.items.find(item => 
                                                                    item.type === "weapon" && item.name === weaponName
                                                                );
                                                            }
                                                        }
                                                        
                                                        if (updatedWeapon) {
                                                            const updatedClip = updatedWeapon.clip || {};
                                                            rollData.weapon.clip.value = Number(updatedClip.value) || Number(updatedClip.max) || 0;
                                                            rollData.weapon.clip.max = Number(updatedClip.max) || 0;
                                                        }
                                                    }
                                                    // Don't proceed automatically - user can click Roll again
                                                } else {
                                                    const reason = reloadResult.reason === "out_of_ammo" 
                                                        ? game.i18n.localize("CHAT.OUT_OF_AMMO") || "Кончились боеприпасы"
                                                        : game.i18n.localize("CHAT.RELOAD_FAILED") || "Не удалось перезарядить";
                                                    
                                                    await ChatMessage.create({
                                                        user: game.user.id,
                                                        content: `<div class="dark-heresy chat roll">
                                                            <div class="dh-notice-card">
                                                                <div class="dh-notice-title">${actor?.name || "Unknown"}</div>
                                                                <div class="dh-notice-body">${reason}</div>
                                                            </div>
                                                        </div>`
                                                    });
                                                }
                                            }
                                        },
                                        cancel: {
                                            icon: '<i class="fas fa-times"></i>',
                                            label: game.i18n.localize("BUTTON.CANCEL"),
                                            callback: () => {}
                                        }
                                    },
                                    default: "reload"
                                });
                                reloadDialog.render(true);
                                return; // Don't proceed with roll
                            }
                        }

                        await combatRoll(rollData);
                        
                        // Ammo is already consumed inside combatRoll, no need to consume again
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTON.CANCEL"),
                    callback: () => {}
                }
            },
            default: "roll",
            close: () => {},
            render: dlgHtml => {
                const formatSigned = value => {
                    const num = Number(value) || 0;
                    if (num > 0) return `+${num}`;
                    if (num < 0) return `${num}`;
                    return "0";
                };
                const setOptionLabels = (select, getSuffix) => {
                    if (!select?.length) return;
                    select.find("option").each((_, opt) => {
                        const option = $(opt);
                        const baseText = option.data("baseText") || option.text();
                        option.data("baseText", baseText);
                        const suffix = getSuffix(option.val(), baseText, option);
                        option.text(suffix ? `${baseText} (${suffix})` : baseText);
                    });
                };

                setOptionLabels(dlgHtml.find("#aim"), value => formatSigned(value));
                setOptionLabels(dlgHtml.find("#range"), value => formatSigned(value));

                // Disable aiming options for inaccurate weapons (only "0" should be available)
                if (rollData.weapon?.traits?.inaccurate) {
                    const aimSelect = dlgHtml.find("#aim");
                    if (aimSelect.length) {
                        const disableAimOption = (value, disabled) => {
                            const option = aimSelect.find(`option[value='${value}']`);
                            if (!option.length) return;
                            option.prop("disabled", disabled);
                            // Add visual styling class
                            if (disabled) {
                                option.addClass("disabled-option");
                            } else {
                                option.removeClass("disabled-option");
                            }
                        };
                        // Disable all aiming options except "0" (no aiming)
                        aimSelect.find("option").each((_, opt) => {
                            const option = $(opt);
                            const value = option.val();
                            if (value !== "0" && value !== "none") {
                                option.prop("disabled", true);
                                option.addClass("disabled-option");
                            }
                        });
                        // Set to "0" if currently aiming
                        const currentAim = aimSelect.val();
                        if (currentAim && currentAim !== "0" && currentAim !== "none") {
                            aimSelect.val("0");
                        }
                    }
                }

                const attackTypeMods = rollData.weapon?.isRange
                    ? {
                        none: null,
                        standard: "+10",
                        semi_auto: "0",
                        full_auto: "-10",
                        wide_auto: "0/-10",
                        suppression: "-20",
                        called_shot: "-20"
                    }
                    : {
                        none: null,
                        standard: "+10",
                        charge: "+20",
                        swift: "0",
                        lightning: "-10",
                        allOut: "+30",
                        called_shot: "-20"
                    };
                setOptionLabels(dlgHtml.find("#attackType"), value => attackTypeMods[value]);
                setOptionLabels(dlgHtml.find("#wideRofLength"), value => (value === "full" ? "-10" : "0"));
                setOptionLabels(dlgHtml.find("#suppressionLength"), value => (value === "full" ? "-20" : "-10"));

                // For melee weapons, disable lightning attack if weapon is unwieldy or unbalanced
                if (!rollData.weapon?.isRange) {
                    const select = dlgHtml.find("#attackType");
                    if (select.length && (rollData.weapon?.traits?.unwieldy || rollData.weapon?.traits?.unbalanced)) {
                        const disableOption = (value, disabled) => {
                            const option = select.find(`option[value='${value}']`);
                            if (!option.length) return;
                            option.prop("disabled", disabled);
                            // Add visual styling class
                            if (disabled) {
                                option.addClass("disabled-option");
                            } else {
                                option.removeClass("disabled-option");
                            }
                        };
                        disableOption("lightning", true);
                        // If lightning was selected, reset to standard
                        const current = select.val();
                        if (current === "lightning") {
                            select.val("standard");
                        }
                    }
                    return;
                }
                const rof = rollData.weapon.rateOfFire || {};
                const canSingle = Number(rof.single) > 0;
                const canBurst = Number(rof.burst) > 0;
                const canFull = Number(rof.full) > 0;
                const canBurstWide = Number(rof.burst) >= 2;
                const canFullWide = Number(rof.full) >= 2;
                const select = dlgHtml.find("#attackType");
                if (!select.length) return;
                const disableOption = (value, disabled) => {
                    const option = select.find(`option[value='${value}']`);
                    if (!option.length) return;
                    option.prop("disabled", disabled);
                };
                disableOption("standard", !canSingle);
                disableOption("called_shot", !canSingle);
                disableOption("semi_auto", !canBurst);
                disableOption("full_auto", !canFull);
                disableOption("wide_auto", !canBurstWide && !canFullWide);
                disableOption("suppression", !canBurst && !canFull);
                const current = select.val();
                const currentOption = select.find(`option[value='${current}']`);
                if (current === "none" || currentOption.prop("disabled")) {
                    const firstEnabled = select
                        .find("option")
                        .filter((_, opt) => !opt.disabled && opt.value !== "none")
                        .first();
                    if (firstEnabled.length) {
                        select.val(firstEnabled.val());
                    }
                }
                const toggleWideAutoFields = () => {
                    const selectedValue = select.val();
                    const wideAutoWrapper = dlgHtml.find(".wide-auto-wrapper");
                    if (selectedValue === "wide_auto") {
                        wideAutoWrapper.show();
                    } else {
                        wideAutoWrapper.hide();
                        dlgHtml.find("#wideRofLength").val("semi");
                    }
                };
                const toggleSuppressionFields = () => {
                    const selectedValue = select.val();
                    const suppressionWrapper = dlgHtml.find(".suppression-wrapper");
                    if (selectedValue === "suppression") {
                        suppressionWrapper.show();
                    } else {
                        suppressionWrapper.hide();
                        dlgHtml.find("#suppressionLength").val("semi");
                    }
                };
                toggleWideAutoFields();
                toggleSuppressionFields();
                const wideSelect = dlgHtml.find("#wideRofLength");
                if (wideSelect.length) {
                    const semiOption = wideSelect.find("option[value='semi']");
                    const fullOption = wideSelect.find("option[value='full']");
                    semiOption.prop("disabled", !canBurstWide);
                    fullOption.prop("disabled", !canFullWide);
                    if (canBurstWide && !canFullWide) wideSelect.val("semi");
                    if (!canBurstWide && canFullWide) wideSelect.val("full");
                }
                const suppressionSelect = dlgHtml.find("#suppressionLength");
                if (suppressionSelect.length) {
                    const semiOption = suppressionSelect.find("option[value='semi']");
                    const fullOption = suppressionSelect.find("option[value='full']");
                    semiOption.prop("disabled", !canBurst);
                    fullOption.prop("disabled", !canFull);
                    if (canBurst && !canFull) suppressionSelect.val("semi");
                    if (!canBurst && canFull) suppressionSelect.val("full");
                }
                dlgHtml.on("change", "#attackType", function () {
                    toggleWideAutoFields();
                    toggleSuppressionFields();
                });
            }
        }, {width: 200});
        dialog.render(true);
}

async function openDirectDamageDialog(rollData) {
    const buildTargetOptions = () => {
        const targets = DarkHeresyUtil.getCurrentTargets();
        if (!targets.length) {
            return `<option value="">—</option>`;
        }
        return targets.map((target, index) => {
            const selected = index === 0 ? "selected" : "";
            const sceneId = target.sceneId ?? "";
            return `<option value="${target.tokenId}" data-scene-id="${sceneId}" ${selected}>${target.name}</option>`;
        }).join("");
    };

    const content = `
        <form class="dh-direct-damage">
            <div class="wrapper">
                <label>${game.i18n.localize("CHAT.HITS_COUNT")}</label>
                <input id="hits-count" type="number" value="1" min="1" data-dtype="Number" />
            </div>
            <div class="wrapper">
                <label>${game.i18n.localize("DIALOG.TARGET")}</label>
                <select id="damage-target">
                    ${buildTargetOptions()}
                </select>
            </div>
        </form>
    `;

    const title = game.i18n.localize("CHAT.ROLL_DAMAGE");
    let hookId = null;
    const dialog = new Dialog({
        title,
        content,
        buttons: {
            ok: {
                icon: "<i class='fas fa-check'></i>",
                label: game.i18n.localize("DIALOG.CONFIRM"),
                callback: async html => {
                    const hits = Math.max(Number(html.find("#hits-count").val()) || 1, 1);
                    const selected = html.find("#damage-target option:selected");
                    const tokenId = selected.val();
                    const sceneId = selected.data("scene-id") || "";
                    const targetName = selected.text();
                    if (!tokenId) {
                        ui.notifications.warn(game.i18n.localize("NOTIFICATION.NO_TARGET_SELECTED"));
                        return;
                    }
                    rollData.numberOfHits = hits;
                    rollData.attackResult = 5;
                    rollData.attackDos = 0;
                    rollData.dos = 0;
                    rollData.aim = { isAiming: false, val: 0, text: "" };
                    rollData.flags = rollData.flags || {};
                    rollData.flags.isDamageRoll = true;
                    rollData.flags.isCombatRoll = false;
                    rollData.flags.isEvasion = false;
                    rollData.flags.isAttack = false;
                    rollData.targets = [{
                        tokenId,
                        sceneId,
                        name: targetName
                    }];
                    await damageRoll(rollData);
                }
            },
            cancel: {
                icon: "<i class='fas fa-times'></i>",
                label: game.i18n.localize("DIALOG.CANCEL")
            }
        },
        default: "ok",
        close: () => {
            if (hookId !== null) {
                Hooks.off("targetToken", hookId);
            }
        }
    }, { width: 280 });
    dialog.render(true);
    hookId = Hooks.on("targetToken", () => {
        const select = dialog.element?.find("#damage-target");
        if (!select?.length) return;
        select.html(buildTargetOptions());
    });
}

// Store reference to the current psychic power dialog to close it when opening a new one
let currentPsychicPowerDialog = null;

/**
 * Show a psychic power roll dialog.
 * @param {object} rollData
 */
async function preparePsychicPowerRoll(rollData) {
    if (rollData.difficulty && typeof rollData.difficulty === "object") {
        rollData.difficulty = rollData.difficulty.value ?? 0;
    } else if (rollData.difficulty === undefined || rollData.difficulty === null) {
        rollData.difficulty = 0;
    }
    // Close previous psychic power dialog if it exists
    if (currentPsychicPowerDialog) {
        currentPsychicPowerDialog.close();
        currentPsychicPowerDialog = null;
    }
    
    const html = await renderTemplate("systems/dark-heresy/template/dialog/psychic-power-roll.hbs", rollData);
    let dialog = new Dialog({
        title: rollData.name,
        content: html,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    rollData.name = game.i18n.localize(rollData.name);
                    rollData.target.base = parseInt(html.find("#target")[0]?.value, 10);
                    rollData.target.modifier = parseInt(html.find("#modifier")[0]?.value, 10);
                    const difficulty = html.find("#difficulty")[0];
                    if (difficulty) {
                        const selectedOption = difficulty.options[difficulty.selectedIndex];
                        rollData.difficulty = {
                            value: parseInt(difficulty.value, 10) || 0,
                            text: $(selectedOption).data("baseText") || selectedOption.text
                        };
                    } else {
                        rollData.difficulty = { value: 0, text: game.i18n.localize("DIFFICULTY.CHALLENGING") };
                    }
                    rollData.psy.value = parseInt(html.find("#psy")[0].value, 10);
                    rollData.psy.warpConduit = html.find("#warpConduit")[0].checked;
                    rollData.weapon.damageFormula = html.find("#damageFormula")[0].value;
                    rollData.weapon.damageType = html.find("#damageType")[0].value;
                    rollData.weapon.damageBonus = parseInt(html.find("#damageBonus")[0].value, 10);
                    rollData.weapon.penetrationFormula = html.find("#penetration")[0].value;
                    rollData.weapon.rateOfFire = { burst: rollData.psy.value, full: rollData.psy.value };
                    const attackType = html.find("#attackType")[0];
                    rollData.attackType.name = attackType.value;
                    rollData.attackType.text = attackType.options[attackType.selectedIndex].text;
                    rollData.psy.useModifier = true;
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = true;
                    await combatRoll(rollData);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }
        },
        default: "roll",
        close: () => {
            // Clear reference when dialog is closed
            if (currentPsychicPowerDialog === dialog) {
                currentPsychicPowerDialog = null;
            }
        },
        render: dialogHtml => {
            const formatSigned = value => {
                const num = Number(value) || 0;
                if (num > 0) return `+${num}`;
                if (num < 0) return `${num}`;
                return "0";
            };
            const setOptionLabels = (select, getSuffix) => {
                if (!select?.length) return;
                select.find("option").each((_, opt) => {
                    const option = $(opt);
                    const baseText = option.data("baseText") || option.text();
                    option.data("baseText", baseText);
                    const suffix = getSuffix(option.val(), baseText, option);
                    option.text(suffix ? `${baseText} (${suffix})` : baseText);
                });
            };
            setOptionLabels(dialogHtml.find("#difficulty"), value => formatSigned(value));
        }
    }, {width: 200});
    
    // Store reference to this dialog
    currentPsychicPowerDialog = dialog;
    dialog.render(true);
}


class DarkHeresyUtil {

    static getCurrentTargets() {
        return Array.from(game.user?.targets || []).map(token => ({
            tokenId: token.id,
            sceneId: token.scene?.id,
            name: token.name
        }));
    }

    static createCommonAttackRollData(actor, item) {
        const targets = this.getCurrentTargets();
        const primaryTarget = targets[0];
        return {
            name: item.name,
            itemName: item.name, // Seperately here because evasion may override it
            ownerId: actor.id,
            itemId: item.id,
            target: {
                base: 0,
                modifier: 0
            },
            weapon: {
                damageBonus: 0,
                damageType: item.damageType
            },
            psy: {
                value: actor.psy.rating,
                display: false
            },
            attackType: {
                name: "standard",
                text: ""
            },
            targets: primaryTarget ? [primaryTarget] : undefined,
            flags: {
                isAttack: true
            }
        };
    }

    static createCommonNormalRollData(actor, value) {
        return {
            target: {
                base: value.displayTotal ?? value.total,
                modifier: 0
            },
            flags: {
                isAttack: false
            },
            ownerId: actor.id
        };
    }

    /**
     * Find effect data from CONFIG.statusEffects by key and type
     * @param {string} key - Condition key (id)
     * @param {string} type - Effect type (minor/major), defaults to "minor"
     * @returns {object|undefined} - Effect data or undefined
     */
    static findEffect(key, type = "minor") {
        const statusEffect = CONFIG.statusEffects.find(s => s.id === key);
        if (!statusEffect) {
            return undefined;
        }

        // Return the statusEffect with type information
        return foundry.utils.deepClone({
            ...statusEffect,
            system: {
                type: type
            }
        });
    }

    /**
     * Get create data for ActiveEffect from effect config
     * @param {object} effectData - Effect data from findEffect
     * @param {string} key - Condition key (id)
     * @returns {object} - Data for creating ActiveEffect
     */
    static getCreateData(effectData, key) {
        if (!effectData) {
            return null;
        }

        // Localize the name
        let effectName = effectData.name || effectData.id;
        if (effectData.name && effectData.name.startsWith("CONDITION.")) {
            const localized = game.i18n.localize(effectData.name);
            effectName = (localized !== effectData.name) ? localized : (effectData.name || effectData.id);
        }

        return {
            name: effectName,
            img: effectData.img,
            // Store key directly (like impmal uses e.key)
            key: key,
            // Store key in flags as backup
            flags: {
                "dark-heresy": {
                    key: key
                }
            },
            // Store key and type in system
            system: {
                key: key,
                type: effectData.system?.type || "minor"
            },
            // Use statuses array for token synchronization
            statuses: effectData.statuses || [key],
            // Make it permanent
            duration: { seconds: null },
            // transfer: true (default) automatically syncs statuses to tokens
        };
    }

    static createWeaponRollData(actor, weaponItem) {
        let characteristic = this.getWeaponCharacteristic(actor, weaponItem);
        const characteristicKey = weaponItem.class === "melee" ? "weaponSkill" : "ballisticSkill";
        let rateOfFire;
        if (weaponItem.class === "melee") {
            // Use displayBonus from STATS (the "source of truth") which includes tempModifier
            const bonusValue = characteristic.displayBonus || characteristic.bonus;
            rateOfFire = { single: 1, burst: bonusValue, full: bonusValue };
        } else {
            rateOfFire = {
                single: weaponItem.rateOfFire?.single || 0,
                burst: weaponItem.rateOfFire?.burst || 0,
                full: weaponItem.rateOfFire?.full || 0
            };
        }
        let weaponTraits = this.extractWeaponTraits(weaponItem.special);
        let isMelee = weaponItem.class === "melee";
        let attributeMod = (isMelee && !weaponItem.damage.match(/SB/gi) ? "+SB" : "");

        let rollData = this.createCommonAttackRollData(actor, weaponItem);

        // Set tokenId if actor is a token actor
        if (actor.isToken && actor.token) {
            rollData.tokenId = actor.token.id;
        }

        const baseTarget = characteristic.displayTotal ?? characteristic.total;
        rollData.target.base = baseTarget + weaponItem.attack;
        rollData.characteristicKey = characteristicKey;
        rollData.rangeMod = !isMelee ? 10 : 0;

        // Handle Force weapon property: add psy rating to damage and penetration
        // Force is now a weapon TRAIT from Special field, not a type
        let forcePsyRating = 0;
        let forcePenetrationValue = weaponItem.penetration || "0";
        
        // Check if weapon has Force trait from Special field
        let hasForce = weaponTraits.force === true;
        
        if (hasForce) {
            // Get BASE psy rating from actor (from Advances, not currentRating)
            // Structure is: system.psy.rating (flat, same as used in createPsychicRollData)
            // actor.psy getter returns system.psy, so actor.psy.rating works
            // For Force weapons, we always use BASE rating, not currentRating (which includes sustained)
            let psyRating = 0;
            
            // Primary: via getter - get BASE rating (actor.psy.rating)
            if (actor.psy && actor.psy.rating !== undefined && actor.psy.rating !== null) {
                psyRating = parseInt(actor.psy.rating, 10) || 0;
            }
            // Fallback: direct system access to BASE rating
            else if (actor.system && actor.system.psy && actor.system.psy.rating !== undefined && actor.system.psy.rating !== null) {
                psyRating = parseInt(actor.system.psy.rating, 10) || 0;
            }
            
            forcePsyRating = psyRating;
            
            if (forcePsyRating > 0) {
                // For penetration, calculate base value and add psy rating
                let basePenetration = 0;
                try {
                    // Handle both string and number types
                    let penetrationValue = weaponItem.penetration;
                    let penetrationStr = "";
                    
                    if (penetrationValue === null || penetrationValue === undefined) {
                        penetrationStr = "0";
                    } else if (typeof penetrationValue === 'number') {
                        basePenetration = penetrationValue || 0;
                    } else {
                        penetrationStr = penetrationValue.toString().trim();
                        // If it's a simple number string, parse it directly
                        if (penetrationStr && !isNaN(penetrationStr)) {
                            basePenetration = parseInt(penetrationStr, 10) || 0;
                        } else {
                            // Replace common symbols with 0 to get base numeric value
                            let baseFormula = penetrationStr
                                .replace(/SB/gi, "0")
                                .replace(/TB/gi, "0")
                                .replace(/PR/gi, "0")
                                .replace(/[A-Za-z]+/g, "0"); // Replace any remaining letters with 0
                            try {
                                let tempRoll = new Roll(baseFormula || "0");
                                tempRoll.evaluate({async: false});
                                basePenetration = tempRoll.total || 0;
                            } catch (e) {
                                // If evaluation fails, try to extract first number
                                let numericMatch = penetrationStr.match(/^(\d+)/);
                                if (numericMatch) {
                                    basePenetration = parseInt(numericMatch[1], 10) || 0;
                                }
                            }
                        }
                    }
                } catch (e) {
                    // If parsing fails, default to 0
                    basePenetration = 0;
                }
                forcePenetrationValue = (basePenetration + forcePsyRating).toString();
            }
        }

        // Build damage formula with Force bonus if applicable
        let damageFormula = weaponItem.damage + attributeMod;
        if (hasForce && forcePsyRating > 0) {
            damageFormula += `+${forcePsyRating}`;
        }

        const hordeBonusDice = _getHordeDamageBonusDiceFromActor(actor);
        if (hordeBonusDice > 0) {
            damageFormula += `+${hordeBonusDice}d10`;
        }
        
        // Get clip data
        const clipData = weaponItem.clip || weaponItem.system?.clip || { value: 0, max: 0 };
        const clip = {
            value: Number(clipData.value) || 0,
            max: Number(clipData.max) || 0
        };
        
        rollData.weapon = foundry.utils.mergeObject(rollData.weapon, {
            isMelee: isMelee,
            isRange: !isMelee,
            weaponClass: weaponItem.class,
            weaponType: weaponItem.subtype || weaponItem.system?.type,
            clip: clip,
            rateOfFire: rateOfFire,
            range: !isMelee ? weaponItem.range : 0,
            damageFormula: damageFormula,
            penetrationFormula: forcePenetrationValue,
            traits: weaponTraits,
            special: weaponItem.special
        });
        rollData.hordeDamageBonusDice = hordeBonusDice;
        rollData.hordeBonusApplied = hordeBonusDice > 0;

        return rollData;
    }

    static createPsychicRollData(actor, power) {
        let focusPowerTarget = this.getFocusPowerTarget(actor, power);

        let rollData = this.createCommonAttackRollData(actor, power);
        rollData.target.base= focusPowerTarget.displayTotal ?? focusPowerTarget.total;
        rollData.target.modifier= power.focusPower.difficulty;
        const difficultyValue = Number(power.system?.difficulty) || 0;
        rollData.difficulty = {
            value: difficultyValue,
            text: game.i18n.localize(Dh.difficulties[difficultyValue] || "DIFFICULTY.CHALLENGING")
        };
        const focusKey = power.focusPower?.test?.toLowerCase();
        if (focusKey && actor.characteristics.hasOwnProperty(focusKey)) {
            rollData.characteristicKey = focusKey;
        } else if (focusKey && actor.skills.hasOwnProperty(focusKey)) {
            const skill = actor.skills[focusKey];
            const short = skill?.defaultCharacteristic || skill?.characteristics?.[0];
            if (short) {
                const match = Object.entries(actor.characteristics)
                    .find(([, char]) => char.short === short);
                if (match) {
                    rollData.characteristicKey = match[0];
                }
            }
        } else {
            const match = Object.entries(actor.characteristics)
                .find(([, char]) => char === focusPowerTarget);
            if (match) {
                rollData.characteristicKey = match[0];
            }
        }
        rollData.weapon = foundry.utils.mergeObject(rollData.weapon, {
            damageFormula: power.damage.formula,
            penetrationFormula: power.damage.penetration,
            traits: this.extractWeaponTraits(power.damage.special),
            special: power.damage.special
        });
        rollData.attackType.name = power.damage.zone;
        
        const psyClass = actor.psy.class || "bound";
        // Use currentRating (base rating - sustained - sustained powers count) instead of base rating
        let baseCurrentRating = actor.psy.currentRating || actor.psy.rating || 0;
        let displayedRating = baseCurrentRating;
        
        // If Bound, the displayed Psy Rating is divided by 2 and rounded UP
        if (psyClass === "bound") {
            displayedRating = Math.ceil(baseCurrentRating / 2);
        }
        
        // Ensure value doesn't exceed max (10)
        const maxRating = 10;
        if (displayedRating > maxRating) {
            displayedRating = maxRating;
        }
        
        rollData.psy = {
            value: displayedRating, // Displayed value (already adjusted for Bound and sustained)
            rating: actor.psy.rating, // Base rating (for reference)
            currentRating: baseCurrentRating, // Current rating (base - sustained)
            max: maxRating, // Maximum slider value is always 10
            warpConduit: false,
            display: true,
            class: psyClass // Store the class (bound/unbound/daemonic)
        };
        return rollData;
    }

    static createSkillRollData(actor, skillName) {
        const skill = actor.skills[skillName];
        const defaultChar = skill.defaultCharacteristic || skill.characteristics[0];

        let characteristics = this.getCharacteristicOptions(actor, defaultChar);
        characteristics = characteristics.map(char => {
            char.target += skill.advance;
            return char;
        });
        const defaultCharKey = characteristics.find(char => char.selected)?.key;

        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, skill), {
            name: skill.label,
            characteristics: characteristics,
            characteristicKey: defaultCharKey
        });
    }

    static createSpecialtyRollData(actor, skillName, specialityName) {
        const skill = actor.skills[skillName];
        const speciality = skill.specialities[specialityName];
        const defaultChar = skill.defaultCharacteristic || skill.characteristics[0];

        let characteristics = this.getCharacteristicOptions(actor, defaultChar);
        characteristics = characteristics.map(char => {
            char.target += speciality.advance;
            return char;
        });
        const defaultCharKey = characteristics.find(char => char.selected)?.key;

        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, speciality), {
            name: speciality.label,
            characteristics: characteristics,
            characteristicKey: defaultCharKey
        });
    }

    static createCharacteristicRollData(actor, characteristicName) {
        const characteristic = actor.characteristics[characteristicName];
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: characteristic.label,
            characteristicKey: characteristicName
        });
    }

    static createFearTestRolldata(actor) {
        const characteristic = actor.characteristics.willpower;
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: "FEAR.HEADER"
        });
    }

    static createMalignancyTestRolldata(actor) {
        const characteristic = actor.characteristics.willpower;
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: "CORRUPTION.MALIGNANCY",
            target: {
                modifier: this.getMalignancyModifier(actor.corruption)
            }
        });
    }

    static createTraumaTestRolldata(actor) {
        const characteristic = actor.characteristics.willpower;
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: "TRAUMA.HEADER",
            target: {
                modifier: this.getTraumaModifier(actor.insanity)
            }
        });
    }


    static extractWeaponTraits(traits) {
    // These weapon traits never go above 9 or below 2
        return {
            accurate: this.hasNamedTrait(/(?<!in)Accurate|Точное/gi, traits),
            rfFace: this.extractNumberedTrait(/Vengeful.*\(\d\)|Мстительное.*\(\d\)/gi, traits), // The alternativ die face Righteous Fury is triggered on
            devastating: this.extractNumberedTrait(/Devastating.*\(\d\)|Опустошительное.*\(\d\)/gi, traits), // Additional horde size reduction on successful hit
            proven: this.extractNumberedTrait(/Proven.*\(\d\)|Проверенное.*\(\d\)|Надёжное.*\(\d\)/gi, traits),
            primitive: this.extractNumberedTrait(/Primitive.*\(\d\)|Примитивное.*\(\d\)/gi, traits),
            razorSharp: this.hasNamedTrait(/Razor.?-? *Sharp|Бритвенной остроты|Острое как бритва/gi, traits),
            spray: this.hasNamedTrait(/Spray|Распыление/gi, traits),
            skipAttackRoll: this.hasNamedTrait(/Spray|Распыление/gi, traits), // Currently, spray will always be the same as skipAttackRoll. However, in the future, there may be other skipAttackRoll weapons that are not Spray.
            tearing: this.hasNamedTrait(/Tearing|Разрывающее/gi, traits),
            storm: this.hasNamedTrait(/Storm|Шторм/gi, traits),
            // Twin-Linked can be either "+10 bonus" or "X1 extra hit"
            // Check for "+10" variant first
            twinLinkedBonus: this.hasNamedTrait(/Twin.?-? *Linked.*\+10|Спаренные.*\+10/gi, traits),
            // Check for "X1" variant or default (if just "Twin-Linked" or "Спаренные" without modifier)
            // Only set if NOT twinLinkedBonus (to avoid conflicts)
            twinLinked: (() => {
                const hasBonus = this.hasNamedTrait(/Twin.?-? *Linked.*\+10|Спаренные.*\+10/gi, traits);
                if (hasBonus) return false; // Don't set twinLinked if +10 variant is present
                // Check for X1 variant explicitly
                const hasX1 = this.hasNamedTrait(/Twin.?-? *Linked.*[XxХх]1|Спаренные.*[XxХх]1/gi, traits);
                if (hasX1) return true;
                // Check for default (just "Twin-Linked" or "Спаренные" without any modifier)
                return this.hasNamedTrait(/Twin.?-? *Linked(?!.*\+10)(?!.*[XxХх]1)|Спаренные(?!.*\+10)(?!.*[XxХх]1)/gi, traits);
            })(),
            force: this.hasNamedTrait(/Force|Психосиловое|Психосиловой/gi, traits),
            inaccurate: this.hasNamedTrait(/Inaccurate|Неточное/gi, traits),
            unwieldy: this.hasNamedTrait(/Unwieldy|Громоздкое/gi, traits),
            reliable: this.hasNamedTrait(/Reliable|Надёжное|Надежное/gi, traits),
            unreliable: this.hasNamedTrait(/Unreliable|Ненадёжное|Ненадежное/gi, traits),
            unbalanced: this.hasNamedTrait(/Unbalanced|Несбалансированное/gi, traits),
            overheating: this.hasNamedTrait(/Overheating|Перегревающееся/gi, traits),
            shock: this.hasNamedTrait(/Shock|Шоковое/gi, traits)
        };
    }

    static getMaxPsyRating(actor) {
        let base = actor.psy.rating;
        switch (actor.psy.class) {
            case "bound":
                return base + 2;
            case "unbound":
                return base + 4;
            case "daemonic":
                return base + 3;
        }
    }

    static extractNumberedTrait(regex, traits) {
        let rfMatch = traits.match(regex);
        if (rfMatch) {
            regex = /\d+/gi;
            return parseInt(rfMatch[0].match(regex)[0]);
        }
        return undefined;
    }

    static hasNamedTrait(regex, traits) {
        if (!traits || typeof traits !== 'string') {
            return false;
        }
        let rfMatch = traits.match(regex);
        if (rfMatch) {
            return true;
        } else {
            return false;
        }
    }

    static getWeaponCharacteristic(actor, weapon) {
        if (weapon.class === "melee") {
            return actor.characteristics.weaponSkill;
        } else {
            return actor.characteristics.ballisticSkill;
        }
    }

    static getFocusPowerTarget(actor, psychicPower) {
        const normalizeName = psychicPower.focusPower.test.toLowerCase();
        if (actor.characteristics.hasOwnProperty(normalizeName)) {
            return actor.characteristics[normalizeName];
        } else if (actor.skills.hasOwnProperty(normalizeName)) {
            return actor.skills[normalizeName];
        } else {
            return actor.characteristics.willpower;
        }
    }

    static getCharacteristicOptions(actor, selected) {
        const characteristics = [];
        for (let [key, char] of Object.entries(actor.characteristics)) {
            const baseTarget = char.displayTotal ?? char.total;
            characteristics.push({
                key: key,
                label: char.label,
                target: baseTarget,
                selected: char.short === selected
            });
        }
        return characteristics;
    }

    static getMalignancyModifier(corruption) {
        if (corruption <= 30) {
            return 0;
        } else if (corruption <= 60) {
            return -10;
        } else if (corruption <= 90) {
            return -20;
        } else {
            return -30;
        }
    }

    static getTraumaModifier(insanity) {
        if (insanity < 10) {
            return 0;
        } else if (insanity < 40) {
            return 10;
        } else if (insanity < 60) {
            return 0;
        } else if (insanity < 80) {
            return -10;
        } else {
            return -20;
        }
    }
}

class DarkHeresySheet extends ActorSheet {
    activateListeners(html) {
        super.activateListeners(html);
        html.find(".item-create").click(ev => this._onItemCreate(ev));
        html.find(".item-edit").click(ev => this._onItemEdit(ev));
        html.find(".item-delete").click(ev => this._onItemDelete(ev));
        html.find(".item-chat").click(async ev => await this._onItemChat(ev));
        html.find("input").focusin(ev => this._onFocusIn(ev));
        html.find(".roll-characteristic").click(async ev => await this._prepareRollCharacteristic(ev));
        html.find(".roll-skill").click(async ev => await this._prepareRollSkill(ev));
        html.find(".roll-speciality").click(async ev => await this._prepareRollSpeciality(ev));
        html.find(".roll-insanity").click(async ev => await this._prepareRollInsanity(ev));
        html.find(".roll-corruption").click(async ev => await this._prepareRollCorruption(ev));
        html.find(".roll-regeneration").click(async ev => await this._prepareRollRegeneration(ev));
        html.find(".roll-weapon").click(async ev => await this._prepareRollWeapon(ev));
        html.find(".roll-weapon-damage").click(async ev => await this._prepareWeaponDamage(ev));
        html.find(".toggle-equipped").click(async ev => await this._toggleEquipped(ev));
        html.find(".roll-psychic-power").click(async ev => await this._prepareRollPsychicPower(ev));
        html.find(".roll-psychic-damage").click(async ev => await this._preparePsychicDamage(ev));

        // Effects listeners
        html.find(".list-create[data-type='effect']").click(ev => this._onEffectCreate(ev));
        html.find(".list-toggle").click(ev => this._onListToggle(ev));
        html.find(".list-delete").click(ev => this._onListDelete(ev));
        html.find(".list-edit").click(ev => this._onListEdit(ev));
        html.find(".pip").click(ev => this._onConditionPipClick(ev));

        this._bindLightningReflexesToggle(html);
        this._bindSpaceMarineToggle(html);
    }

    _onFocusIn(event) {
        $(event.currentTarget).select();
    }

    _bindLightningReflexesToggle(html) {
        const label = html.find(".information.initiative label");
        if (!label.length || !this.actor?.isOwner) return;

        if (!label.find(".dh-lr-toggle").length) {
            const button = $(
                `<button type="button" class="dh-lr-toggle" aria-label="Lightning Reflexes" style="margin-left:6px;padding:0 4px;line-height:1;font-size:10px;border:1px solid #666;border-radius:3px;background:#222;color:#bbb;">LR</button>`
            );
            label.append(button);
        }

        const updateTitle = async () => {
            const enabled = !!this.actor.getFlag("dark-heresy", "lightningReflexes");
            label.attr("title", `Lightning Reflexes: ${enabled ? "ON" : "OFF"}`);
            const btn = label.find(".dh-lr-toggle");
            btn.attr("title", `Lightning Reflexes: ${enabled ? "ON" : "OFF"}`);
            if (enabled) {
                btn.css({ background: "#4a7a2a", color: "#fff", borderColor: "#4a7a2a" });
                btn.text("LR ON");
            } else {
                btn.css({ background: "#222", color: "#bbb", borderColor: "#666" });
                btn.text("LR");
            }
        };

        updateTitle();
        label.find(".dh-lr-toggle").off("click.dhLightningReflexes").on("click.dhLightningReflexes", async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const current = !!this.actor.getFlag("dark-heresy", "lightningReflexes");
            const next = !current;
            await this.actor.setFlag("dark-heresy", "lightningReflexes", next);
            await updateTitle();
            ui.notifications.info(`Lightning Reflexes: ${next ? "ON" : "OFF"}`);
        });
    }

    _bindSpaceMarineToggle(html) {
        const sizeInput = html.find("input[name='system.size']");
        if (!sizeInput.length || !this.actor?.isOwner) return;
        const label = sizeInput.closest(".information").find("label");
        if (!label.length) return;

        if (!label.find(".dh-sm-toggle").length) {
            const button = $(
                `<button type="button" class="dh-sm-toggle" aria-label="Space Marine" style="margin-left:6px;padding:0 4px;line-height:1;font-size:10px;border:1px solid #666;border-radius:3px;background:#222;color:#bbb;">SM</button>`
            );
            label.append(button);
        }

        const updateTitle = async () => {
            const enabled = !!this.actor.getFlag("dark-heresy", "spaceMarine");
            label.attr("title", `Space Marine: ${enabled ? "ON" : "OFF"}`);
            const btn = label.find(".dh-sm-toggle");
            btn.attr("title", `Space Marine: ${enabled ? "ON" : "OFF"}`);
            if (enabled) {
                btn.css({ background: "#7a2a2a", color: "#fff", borderColor: "#7a2a2a" });
                btn.text("SM ON");
            } else {
                btn.css({ background: "#222", color: "#bbb", borderColor: "#666" });
                btn.text("SM");
            }
        };

        updateTitle();
        label.find(".dh-sm-toggle").off("click.dhSpaceMarine").on("click.dhSpaceMarine", async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const current = !!this.actor.getFlag("dark-heresy", "spaceMarine");
            const next = !current;
            await this.actor.setFlag("dark-heresy", "spaceMarine", next);
            await updateTitle();
            ui.notifications.info(`Space Marine: ${next ? "ON" : "OFF"}`);
        });
    }

    /** @override */
    async getData() {
        const data = super.getData();
        data.system = data.data.system;
        data.items = this.constructItemLists(data);
        data.enrichment = await this._enrichment();
        
        // Prepare effects data for the effects tab
        data.effects = this.organizeEffects(data);
        data.conditions = this.formatConditions(data);
        
        return data;
    }

    /**
     * Organize effects into active, passive, and disabled categories
     */
    organizeEffects(data) {
        if (!this.actor) {
            return {
                active: [],
                passive: [],
                disabled: []
            };
        }

        // Get all effects from actor
        const actorEffects = this.actor.effects ? Array.from(this.actor.effects) : [];
        
        // Get all effects from actor's items
        const itemEffects = [];
        if (this.actor.items) {
            for (const item of this.actor.items) {
                if (item.effects && item.effects.size > 0) {
                    for (const effect of item.effects) {
                        itemEffects.push(effect);
                    }
                }
            }
        }
        
        // Combine all effects
        const allEffects = [...actorEffects, ...itemEffects];
        
        // Sort effects by name
        const sorted = allEffects.sort((a, b) => {
            const nameA = a.name || "";
            const nameB = b.name || "";
            return nameA.localeCompare(nameB);
        });

        // Categorize effects
        const effects = {
            active: [],
            passive: [],
            disabled: []
        };

        for (const effect of sorted) {
            // Determine parent (actor or item)
            const parent = effect.parent;
            const isItemEffect = parent?.type === "Item";
            const item = isItemEffect ? parent : null;
            
            // Check if effect has statuses (for conditions)
            const statuses = effect.statuses || effect.toObject?.()?.statuses || effect.system?.statuses;
            const hasStatuses = statuses && Array.isArray(statuses) && statuses.length > 0;
            
            const effectData = {
                id: effect.id,
                uuid: effect.uuid || effect.id,
                name: effect.name,
                img: effect.img || "icons/svg/aura.svg",
                disabled: effect.disabled,
                source: item ? item.name : (effect.source?.name || "Actor"),
                item: item,
                actor: !isItemEffect ? this.actor : null,
                flags: effect.flags || {},
                statuses: statuses || [],
                isCondition: hasStatuses
            };

            // Check if effect is temporary (has duration)
            const isTemporary = effect.duration?.rounds || effect.duration?.turns || effect.duration?.seconds;

            if (effect.disabled) {
                effects.disabled.push(effectData);
            } else if (isTemporary) {
                effects.active.push(effectData);
            } else {
                effects.passive.push(effectData);
            }
        }

        return effects;
    }

    /**
     * Format conditions for display (like impmal)
     */
    formatConditions(data) {
        // Get status effects from CONFIG
        const conditions = foundry.utils.deepClone(CONFIG.statusEffects || []);
        
        // For now, all conditions are boolean (no tiered support yet)
        // In future, can add game.darkHeresy.config.tieredCondition similar to impmal
        conditions.forEach(c => {
            c.boolean = true; // All conditions are boolean for now
            c.existing = this.actor.hasCondition(c.id);
            c.opacity = 30;

            // Conditions have 1 or 2 pips, two for minor/major
            // If condition exists on actor, it must have at least one filled pip
            c.pips = [{ filled: !!c.existing, type: "minor" }];

            // If not boolean (minor/major), add another pip, filled if major
            // For now, we only support boolean conditions
            // if (!c.boolean) {
            //     c.pips.push({ filled: c.existing?.isMajor, type: "major" });
            // }

            if (c.boolean && c.existing) {
                c.opacity = 100;
            }
            // else if (c.existing?.isMinor) {
            //     c.opacity = 60;
            // }

            // Localize the status name
            let localizedName = c.name || c.id;
            if (c.name && (c.name.startsWith("CONDITION.") || c.name.startsWith("EFFECT."))) {
                const localized = game.i18n.localize(c.name);
                localizedName = (localized !== c.name) ? localized : (c.name || c.id);
            }
            c.name = localizedName;
        });

        return conditions;
    }

    async _enrichment() {
        let enrichment = {};
        if (this.actor.type !== "npc") {
            enrichment["system.bio.notes"] = await TextEditor.enrichHTML(this.actor.system.bio.notes, {async: true});
        } else {
            enrichment["system.notes"] = await TextEditor.enrichHTML(this.actor.system.notes, {async: true});
        }
        return foundry.utils.expandObject(enrichment);
    }

    /** @override */
    get template() {
        if (!game.user.isGM && this.actor.limited) {
            return "systems/dark-heresy/template/sheet/actor/limited-sheet.hbs";
        } else {
            return this.options.template;
        }
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [
                {
                    label: game.i18n.localize("BUTTON.ROLL"),
                    class: "custom-roll",
                    icon: "fas fa-dice",
                    onclick: async () => await this._prepareCustomRoll()
                }
            ].concat(buttons);
        }
        return buttons;
    }

    _onItemCreate(event) {
        event.preventDefault();
        let header = event.currentTarget.dataset;

        let data = {
            name: `New ${game.i18n.localize(`TYPES.Item.${header.type.toLowerCase()}`)}`,
            type: header.type
        };
        
        // Для NPC автоматически активируем оружие, броню и force field
        if (this.actor.type === "npc" && (header.type === "weapon" || header.type === "armour" || header.type === "forceField")) {
            data.system = { equipped: true };
        }
        
        this.actor.createEmbeddedDocuments("Item", [data], { renderSheet: true });
    }

    _onItemEdit(event) {
        event.preventDefault();
        const div = $(event.currentTarget).closest("[data-item-id]");
        let item = this.actor.items.get(div.data("itemId"));
        if (item) {
        item.sheet.render(true);
        }
    }

    _onItemDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget).closest("[data-item-id]");
        const itemId = div.data("itemId");
        this.actor.deleteEmbeddedDocuments("Item", [itemId]);
        div.slideUp(200, () => this.render(false));
    }

    async _onItemChat(event) {
        event.preventDefault();
        const div = $(event.currentTarget).closest("[data-item-id]");
        const itemId = div.data("itemId");
        if (!itemId) {
            console.warn("Item ID not found");
            return;
        }
        const item = this.actor.items.get(itemId);
        if (!item) {
            console.warn(`Item with ID ${itemId} not found`);
            return;
        }
        if (typeof item.sendToChat === "function") {
            await item.sendToChat();
        } else {
            console.warn("sendToChat method not found on item", item);
        }
    }

    // ============================================
    // Effects Handlers
    // ============================================

    /**
     * Get document from event (effect or item)
     */
    _getDocument(event) {
        // Try both .list-item and .effect.item selectors
        const li = $(event.currentTarget).closest(".list-item, .effect.item");
        const collection = this._getCollection(event);
        const id = li.data("id");
        const uuid = li.data("uuid");
        
        if (collection === "effects") {
            // First try to find in actor effects
            if (id) {
                const actorEffect = this.actor.effects.get(id);
                if (actorEffect) return actorEffect;
            } else if (uuid) {
                const actorEffect = this.actor.effects.find(e => e.uuid === uuid);
                if (actorEffect) return actorEffect;
            }
            
            // If not found in actor, search in item effects
            if (this.actor.items) {
                for (const item of this.actor.items) {
                    if (item.effects) {
                        if (id) {
                            const itemEffect = item.effects.get(id);
                            if (itemEffect) return itemEffect;
                        } else if (uuid) {
                            const itemEffect = item.effects.find(e => e.uuid === uuid);
                            if (itemEffect) return itemEffect;
                        }
                    }
                }
            }
            
            return null;
        } else if (collection === "items") {
            if (id) {
                return this.actor.items.get(id);
            }
        }
        
        return null;
    }

    /**
     * Get collection name from event
     */
    _getCollection(event) {
        // Try both .list-item and .effect.item selectors
        const li = $(event.currentTarget).closest(".list-item, .effect.item");
        return li.data("collection") || "items";
    }

    /**
     * Get ID from event
     */
    _getId(event) {
        // Try both .list-item and .effect.item selectors
        const li = $(event.currentTarget).closest(".list-item, .effect.item");
        return li.data("id") || li.data("uuid");
    }

    /**
     * Create a new effect
     */
    async _onEffectCreate(ev) {
        ev.preventDefault();
        const category = ev.currentTarget.dataset.category || "passive";
        
        let effectData = {
            name: game.i18n.localize("EFFECTS.TITLE"),
            img: "icons/svg/aura.svg"
        };

        // Set duration for temporary effects
        if (category === "temporary") {
            effectData.duration = {
                rounds: 1
            };
        } else if (category === "disabled") {
            effectData.disabled = true;
        }

        // If Item effect, use item name for effect name
        if (this.object.documentName === "Item") {
            effectData.name = this.object.name;
        }

        const effects = await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
        if (effects.length > 0) {
            const effect = effects[0];
            
            // Effect with statuses array automatically applies to tokens via transfer: true
            // No manual toggleStatusEffect needed (like impmal)
            
            effect.sheet.render(true);
        }
    }

    /**
     * Toggle effect enabled/disabled
     */
    async _onListToggle(event) {
        event.preventDefault();
        const document = this._getDocument(event);
        
        if (!document) return;

        const newDisabled = !document.disabled;
        await document.update({ disabled: newDisabled });
        
        // Effect with statuses array automatically syncs with tokens via transfer: true
        // No manual toggleStatusEffect needed (like impmal)
        
        // Force sheet update to reflect changes in conditions
        this.render(false);
    }

    /**
     * Delete effect or item
     */
    async _onListDelete(event) {
        event.preventDefault();
        const document = this._getDocument(event);
        const collection = this._getCollection(event);
        
        if (!document) return;

        const docName = collection === "effects" ? "ActiveEffect" : "Item";
        const title = game.i18n.localize(`Delete${docName}`);
        const content = `<p>${game.i18n.localize(`Delete${docName}Confirmation`)}</p>`;

        await Dialog.confirm({
            title: title,
            content: content,
            yes: async () => {
                // When effect is deleted, statuses are automatically removed via transfer: true
                // No manual toggleStatusEffect needed (like impmal)
                await document.delete();
                // Force sheet update to reflect changes in conditions
                this.render(false);
            },
            no: () => {},
            defaultYes: true
        });
    }

    /**
     * Edit effect or item
     */
    async _onListEdit(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Check if this is a link to an item (has data-uuid)
        const uuid = $(event.currentTarget).data("uuid");
        if (uuid) {
            try {
                const item = await fromUuid(uuid);
                if (item) {
                    item.sheet.render(true);
                    return;
                }
            } catch (err) {
                console.warn("Failed to resolve UUID:", uuid, err);
            }
        }
        
        // Otherwise, get the document from the parent element
        const document = this._getDocument(event);
        
        if (document) {
            document.sheet.render(true);
        }
    }

    /**
     * Handle condition pip click (like impmal)
     */
    async _onConditionPipClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        
        const key = ev.currentTarget.dataset.key;
        const type = ev.currentTarget.dataset.type || "minor";
        const existing = this.actor.hasCondition(key);

        if (!existing || (existing?.system?.type === "minor" && type === "major")) {
            await this.actor.addCondition(key, { type });
        } else {
            await this.actor.removeCondition(key);
        }
    }

    async _prepareCustomRoll() {
        const rollData = {
            name: "DIALOG.CUSTOM_ROLL",
            baseTarget: 50,
            modifier: 0,
            ownerId: this.actor.id
        };
        await prepareCommonRoll(rollData);
    }

    async _prepareRollCharacteristic(event) {
        event.preventDefault();
        const characteristicName = $(event.currentTarget).data("characteristic");
        await prepareCommonRoll(
            DarkHeresyUtil.createCharacteristicRollData(this.actor, characteristicName)
        );
    }

    async _prepareRollSkill(event) {
        event.preventDefault();
        const skillName = $(event.currentTarget).data("skill");
        await prepareCommonRoll(
            DarkHeresyUtil.createSkillRollData(this.actor, skillName)
        );
    }

    async _prepareRollSpeciality(event) {
        event.preventDefault();
        const skillName = $(event.currentTarget).parents(".item").data("skill");
        const specialityName = $(event.currentTarget).data("speciality");
        await prepareCommonRoll(
            DarkHeresyUtil.createSpecialtyRollData(this.actor, skillName, specialityName)
        );
    }

    async _prepareRollInsanity(event) {
        event.preventDefault();
        await prepareCommonRoll(
            DarkHeresyUtil.createFearTestRolldata(this.actor)
        );
    }

    async _prepareRollCorruption(event) {
        event.preventDefault();
        await prepareCommonRoll(
            DarkHeresyUtil.createMalignancyTestRolldata(this.actor)
        );
    }

    async _prepareRollRegeneration(event) {
        event.preventDefault();
        const rollData = DarkHeresyUtil.createCharacteristicRollData(this.actor, "toughness");
        rollData.name = "WOUND.REGENERATION";
        rollData.flags = rollData.flags || {};
        rollData.flags.isRegeneration = true;
        rollData.regeneration = Number(this.actor.system?.wounds?.regeneration) || 0;
        rollData.actorUuid = this.actor.uuid;
        if (this.actor.token?.id) {
            rollData.tokenId = this.actor.token.id;
        }
        if (this.actor.token?.uuid) {
            rollData.tokenUuid = this.actor.token.uuid;
        }
        if (this.actor.token?.scene?.id) {
            rollData.sceneId = this.actor.token.scene.id;
        }
        await prepareCommonRoll(rollData);
    }

    async _prepareRollWeapon(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const weapon = this.actor.items.get(div.data("itemId"));
        
        // Check if weapon is equipped
        if (!weapon || weapon.system.equipped !== true) {
            ui.notifications.warn(game.i18n.localize("WEAPON.NOT_EQUIPPED") || "Weapon must be equipped to use");
            return;
        }
        
        await prepareCombatRoll(
            DarkHeresyUtil.createWeaponRollData(this.actor, weapon),
            this.actor
        );
    }

    async _prepareWeaponDamage(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const weapon = this.actor.items.get(div.data("itemId"));
        
        // Check if weapon is equipped
        if (!weapon || weapon.system.equipped !== true) {
            ui.notifications.warn(game.i18n.localize("WEAPON.NOT_EQUIPPED") || "Weapon must be equipped to use");
            return;
        }
        
        const rollData = DarkHeresyUtil.createWeaponRollData(this.actor, weapon);
        await openDirectDamageDialog(rollData);
    }

    async _toggleEquipped(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Try to get itemId from button's data attribute first, then from parent
        const itemId = $(event.currentTarget).data("itemId") || $(event.currentTarget).parents(".item").data("itemId") || $(event.currentTarget).parents(".gear-block").data("itemId");
        if (!itemId) {
            console.warn("Dark Heresy: Could not find itemId for toggle equipped");
            return;
        }
        
        const item = this.actor.items.get(itemId);
        if (!item) {
            console.warn("Dark Heresy: Item not found for toggle equipped", itemId);
            return;
        }
        
        const currentEquipped = item.system.equipped === true;
        await item.update({"system.equipped": !currentEquipped});
    }

    async _prepareRollPsychicPower(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const psychicPower = this.actor.items.get(div.data("itemId"));
        await preparePsychicPowerRoll(
            DarkHeresyUtil.createPsychicRollData(this.actor, psychicPower)
        );
    }

    async _preparePsychicDamage(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const psychicPower = this.actor.items.get(div.data("itemId"));
        const rollData = DarkHeresyUtil.createPsychicRollData(this.actor, psychicPower);
        await openDirectDamageDialog(rollData);
    }

    constructItemLists() {
        let items = {};
        let itemTypes = this.actor.itemTypes;
        items.mentalDisorders = itemTypes.mentalDisorder;
        items.malignancies = itemTypes.malignancy;
        items.mutations = itemTypes.mutation;
        if (this.actor.type === "npc") {
            items.abilities = itemTypes.talent
                .concat(itemTypes.trait)
                .concat(itemTypes.specialAbility);
        }
        items.talents = itemTypes.talent;
        items.traits = itemTypes.trait;
        items.specialAbilities = itemTypes.specialAbility;
        items.aptitudes = itemTypes.aptitude;

        items.psychicPowers = itemTypes.psychicPower;

        items.criticalInjuries = itemTypes.criticalInjury;

        items.gear = itemTypes.gear;
        items.drugs = itemTypes.drug;
        items.tools = itemTypes.tool;
        items.cybernetics = itemTypes.cybernetic;

        items.armour = itemTypes.armour;
        items.forceFields = itemTypes.forceField;

        // Show all weapons in combat tab (equipped and unequipped)
        items.weapons = itemTypes.weapon;
        items.weaponMods = itemTypes.weaponModification;
        items.ammunitions = itemTypes.ammunition;
        this._sortItemLists(items);

        return items;
    }

    _sortItemLists(items) {
        for (let list in items) {
            if (Array.isArray(items[list])) items[list] = items[list].sort((a, b) => a.sort - b.sort);
            else if (typeof items[list] == "object") _sortItemLists(items[list]);
        }
    }
}

class AcolyteSheet extends DarkHeresySheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "actor"],
            template: "systems/dark-heresy/template/sheet/actor/acolyte.hbs",
            width: 700,
            height: 881,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [].concat(buttons);
        }
        return buttons;
    }

    getData() {
        const data = super.getData();
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".aptitude-create").click(async ev => { await this._onAptitudeCreate(ev); });
        html.find(".aptitude-delete").click(async ev => { await this._onAptitudeDelete(ev); });
        // item-cost is now disabled (read-only) - cost is edited in item sheet settings
        html.find(".item-starter").click(async ev => { await this._onItemStarterClick(ev); });
    }

    async _onAptitudeCreate(event) {
        event.preventDefault();
        let aptitudeId = Date.now().toString();
        let aptitude = { id: Date.now().toString(), name: "New Aptitude" };
        await this.actor.update({[`system.aptitudes.${aptitudeId}`]: aptitude});
        this._render(true);
    }

    async _onAptitudeDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const aptitudeId = div.data("aptitudeId").toString();
        await this.actor.update({[`system.aptitudes.-=${aptitudeId}`]: null});
        this._render(true);
    }

    async _onItemStarterClick(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        let item = this.actor.items.get(div.data("itemId"));
        item.update({"system.starter": $(event.currentTarget)[0].checked});
    }
}

class NpcSheet extends DarkHeresySheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "actor"],
            template: "systems/dark-heresy/template/sheet/actor/npc.hbs",
            width: 700,
            height: 881,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [].concat(buttons);
        }
        return buttons;
    }

    getData() {
        const data = super.getData();
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        // item-cost is now disabled (read-only) - cost is edited in item sheet settings
        html.find(".item-starter").click(async ev => { await this._onItemStarterClick(ev); });
    }

    async _onItemStarterClick(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        let item = this.actor.items.get(div.data("itemId"));
        item.update({"system.starter": $(event.currentTarget)[0].checked});
    }
}

class DarkHeresyItemSheet extends ItemSheet {
    activateListeners(html) {
        super.activateListeners(html);
        html.find("input").focusin(ev => this._onFocusIn(ev));
        
        // Effects listeners
        html.find(".list-create[data-type='effect']").click(ev => this._onEffectCreate(ev));
        html.find(".list-toggle").click(ev => this._onListToggle(ev));
        html.find(".list-delete").click(ev => this._onListDelete(ev));
        html.find(".list-edit").click(ev => this._onListEdit(ev));
        
        // Sync cost changes to actor sheet (for talents and psychic powers)
        if (this.item.type === "talent" || this.item.type === "psychicPower") {
            html.find("input[name='system.cost']").on("change", async (ev) => {
                // Update the item
                await this.item.update({"system.cost": ev.target.value});
                // Refresh actor sheet if it's open
                if (this.item.actor?.sheet?.rendered) {
                    this.item.actor.sheet.render(false);
                }
            });
        }
    }

    async getData() {
        const data = await super.getData();
        data.enrichment = await this._handleEnrichment();
        data.system = data.data.system;
        
        // Prepare effects list for template
        // In Foundry VTT, item.effects is a Collection (read-only), convert it to array for template
        // We create a new property instead of overwriting the read-only one
        if (this.item && this.item.effects) {
            data.item.effectsList = Array.from(this.item.effects.values());
        } else {
            data.item.effectsList = [];
        }
        
        return data;
    }

    async _handleEnrichment() {
        let enrichment ={};
        enrichment["system.description"] = await TextEditor.enrichHTML(this.item.system.description, {async: true});
        enrichment["system.effect"] = await TextEditor.enrichHTML(this.item.system.effect, {async: true});
        return foundry.utils.expandObject(enrichment);
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [
            {
                label: game.i18n.localize("BUTTON.POST_ITEM"),
                class: "item-post",
                icon: "fas fa-comment",
                onclick: ev => this.item.sendToChat()
            }
        ].concat(buttons);
        return buttons;
    }

    _onFocusIn(event) {
        $(event.currentTarget).select();
    }

    // ============================================
    // Effects Handlers
    // ============================================

    _getDocument(event) {
        // Try both .list-item and .effect.item selectors
        const li = $(event.currentTarget).closest(".list-item, .effect.item");
        const collection = this._getCollection(event);
        const id = li.data("id");
        
        if (!id) return null;

        if (collection === "effects") {
            return this.item.effects.get(id);
        }
        
        return null;
    }

    _getCollection(event) {
        // Try both .list-item and .effect.item selectors
        const li = $(event.currentTarget).closest(".list-item, .effect.item");
        return li.data("collection") || "effects";
    }

    _getId(event) {
        // Try both .list-item and .effect.item selectors
        const li = $(event.currentTarget).closest(".list-item, .effect.item");
        return li.data("id");
    }

    async _onEffectCreate(ev) {
        ev.preventDefault();
        
        let effectData = {
            name: this.item.name || game.i18n.localize("EFFECTS.TITLE"),
            img: "icons/svg/aura.svg"
        };

        const effects = await this.item.createEmbeddedDocuments("ActiveEffect", [effectData]);
        if (effects.length > 0) {
            effects[0].sheet.render(true);
        }
    }

    async _onListToggle(event) {
        event.preventDefault();
        const document = this._getDocument(event);
        
        if (!document) return;

        await document.update({ disabled: !document.disabled });
    }

    async _onListDelete(event) {
        event.preventDefault();
        const document = this._getDocument(event);
        
        if (!document) return;

        await Dialog.confirm({
            title: game.i18n.localize("DeleteActiveEffect"),
            content: `<p>${game.i18n.localize("DeleteActiveEffectConfirmation")}</p>`,
            yes: () => {
                document.delete();
            },
            no: () => {},
            defaultYes: true
        });
    }

    async _onListEdit(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const document = this._getDocument(event);
        
        if (document) {
            document.sheet.render(true);
        }
    }
}

class WeaponSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "weapon"],
            template: "systems/dark-heresy/template/sheet/weapon.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    async getData() {
        const data = await super.getData();
        
        // Get ammunition items from actor's inventory for the select dropdown
        data.ammunitionOptions = [];
        const actor = this.item.actor || this.actor;
        const currentAmmunitionId = this.item.system.ammunitionId || "";
        
        if (actor && actor.items) {
            const ammunitionItems = actor.items.filter(item => item.isAmmunition);
            data.ammunitionOptions = ammunitionItems.map(item => {
                const quantity = Number(item.system.quantity) || 0;
                const displayName = quantity > 0 
                    ? `${item.name} (${quantity})` 
                    : item.name;
                return {
                    id: item.id,
                    name: displayName,
                    selected: item.id === currentAmmunitionId
                };
            });
        }
        
        // Add empty option at the beginning
        data.ammunitionOptions.unshift({
            id: "",
            name: game.i18n.localize("WEAPON.AMMUNITION_NONE") || "None",
            selected: !currentAmmunitionId || currentAmmunitionId === ""
        });
        
        return data;
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class AmmunitionSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "ammunition"],
            template: "systems/dark-heresy/template/sheet/ammunition.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class WeaponModificationSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "weapon-modification"],
            template: "systems/dark-heresy/template/sheet/weapon-modification.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class ArmourSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "armour"],
            template: "systems/dark-heresy/template/sheet/armour.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class ForceFieldSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "force-field"],
            template: "systems/dark-heresy/template/sheet/force-field.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class CyberneticSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "cybernetic"],
            template: "systems/dark-heresy/template/sheet/cybernetic.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class DrugSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "drug"],
            template: "systems/dark-heresy/template/sheet/drug.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class GearSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "gear"],
            template: "systems/dark-heresy/template/sheet/gear.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class ToolSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "tool"],
            template: "systems/dark-heresy/template/sheet/tool.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class CriticalInjurySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "critical-injury"],
            template: "systems/dark-heresy/template/sheet/critical-injury.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class MalignancySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "malignancy"],
            template: "systems/dark-heresy/template/sheet/malignancy.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class MentalDisorderSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "mental-disorder"],
            template: "systems/dark-heresy/template/sheet/mental-disorder.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class MutationSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "mutation"],
            template: "systems/dark-heresy/template/sheet/mutation.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class PsychicPowerSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "psychic-power"],
            template: "systems/dark-heresy/template/sheet/psychic-power.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class TalentSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "talent"],
            template: "systems/dark-heresy/template/sheet/talent.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class SpecialAbilitySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "special-ability"],
            template: "systems/dark-heresy/template/sheet/special-ability.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class TraitSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "trait"],
            template: "systems/dark-heresy/template/sheet/trait.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class AptitudeSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "aptitude"],
            template: "systems/dark-heresy/template/sheet/aptitude.hbs",
            width: 620,
            height: 560,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }
}

class RaceSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dark-heresy", "sheet", "race"],
            template: "systems/dark-heresy/template/sheet/race.hbs",
            width: 700,
            height: 800,
            resizable: true,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "data"
                }
            ]
        });
    }
    
    _canDragDrop(selector) {
        // Allow drag and drop on our custom drop zones
        return true;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Delete buttons
        html.find(".skill-delete").click(ev => this._onSkillDelete(ev));
        html.find(".item-delete").click(ev => this._onItemDelete(ev));
        
        // Drag and drop handlers - attach to all list containers and sections
        // Smart routing: items will be automatically sorted by type
        const dropTargets = html.find(".items-list, .skills-list, .race-section");
        
        // Prevent default drag behavior on the form
        html.find("form").on("dragover", ev => {
            // Only prevent if we're over our drop zones
            const target = $(ev.target);
            if (target.closest(".items-list, .skills-list, .race-section").length > 0) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        });
        
        dropTargets.on("dragover", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const originalEvent = ev.originalEvent || ev;
            if (originalEvent.dataTransfer) {
                originalEvent.dataTransfer.dropEffect = "move";
            }
        });
        
        dropTargets.on("drop", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            this._onDrop(ev);
            return false;
        });
        
        // Visual feedback - highlight the entire section when dragging over
        dropTargets.on("dragenter", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const target = $(ev.currentTarget);
            const section = target.closest(".race-section");
            if (section.length) {
                section.addClass("drag-over");
                section.css("border-color", "#4a9eff");
                section.css("background-color", "rgba(74, 158, 255, 0.1)");
            }
        });
        
        dropTargets.on("dragleave", ev => {
            ev.stopPropagation();
            const target = $(ev.currentTarget);
            const section = target.closest(".race-section");
            if (section.length) {
                section.removeClass("drag-over");
                section.css("border-color", "");
                section.css("background-color", "");
            }
        });
        
    }

    async _onSkillDelete(event) {
        event.preventDefault();
        const skillKey = $(event.currentTarget).closest(".skill-item").data("skill-key");
        const updateData = {};
        updateData[`system.startingSkills.-=${skillKey}`] = null;
        await this.item.update(updateData);
    }

    async _onItemDelete(event) {
        event.preventDefault();
        const itemId = $(event.currentTarget).closest(".item-entry").data("item-id");
        const dropZone = $(event.currentTarget).closest(".items-list");
        const dropType = dropZone.data("drop-type");
        
        let updatePath = "";
        if (dropType === "talent") {
            updatePath = "system.startingTalents";
        } else if (dropType === "trait") {
            updatePath = "system.startingTraits";
        } else if (dropType === "equipment") {
            updatePath = "system.startingEquipment";
        }
        
        if (updatePath) {
            const currentList = foundry.utils.getProperty(this.item.system, updatePath) || [];
            const newList = currentList.filter(entry => {
                if (typeof entry === "string") return entry !== itemId;
                return entry.id !== itemId;
            });
            const updateData = {};
            updateData[updatePath] = newList;
            await this.item.update(updateData);
        }
    }

    _onDragOver(event) {
        event.preventDefault();
        const originalEvent = event.originalEvent || event;
        if (originalEvent.dataTransfer) {
            originalEvent.dataTransfer.dropEffect = "move";
        }
    }

    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // In jQuery events, dataTransfer is in originalEvent
        const originalEvent = event.originalEvent || event;
        const dataTransfer = originalEvent.dataTransfer;
        
        if (!dataTransfer) {
            console.warn("RaceSheet: No dataTransfer in event", event);
            return;
        }
        
        const target = $(event.currentTarget);
        target.removeClass("drag-over");
        target.css("background-color", "");
        
        try {
            // Get drop data - Foundry VTT stores it in dataTransfer
            let data;
            try {
                const dragData = dataTransfer.getData("text/plain");
                if (!dragData) {
                    console.warn("RaceSheet: No drop data in dataTransfer");
                    return;
                }
                data = JSON.parse(dragData);
            } catch (e) {
                console.error("RaceSheet: Error parsing drop data", e);
                return;
            }
            
            // Handle Item drops - automatically determine where to add based on item type
            if (data.type === "Item") {
                let item = null;
                
                // Get item from drop data using Foundry's standard method
                if (data.uuid) {
                    try {
                        item = await fromUuid(data.uuid);
                    } catch (e) {
                        console.error("RaceSheet: Error resolving UUID", e);
                    }
                }
                
                if (!item && data.id) {
                    // Try to find item in world
                    item = game.items.get(data.id);
                }
                
                if (!item) {
                    console.warn("RaceSheet: Could not resolve item from drop data", data);
                    ui.notifications.warn("Could not find the item to add.");
                    return;
                }
                
                // Smart routing: automatically determine target based on item type
                if (item.type === "talent") {
                    await this._handleItemDrop(item, "startingTalents");
                    ui.notifications.info(`Added ${item.name} to starting talents.`);
                } else if (item.type === "trait") {
                    await this._handleItemDrop(item, "startingTraits");
                    ui.notifications.info(`Added ${item.name} to starting traits.`);
                } else if (["weapon", "gear", "tool", "ammunition", "armour", "forceField", "cybernetic", "drug", "weaponModification"].includes(item.type)) {
                    await this._handleItemDrop(item, "startingEquipment");
                    ui.notifications.info(`Added ${item.name} to starting equipment.`);
                } else {
                    ui.notifications.warn(`${item.name} (${item.type}) cannot be added to race.`);
                }
            } else if (data.type === "Skill" || data.type === "skill") {
                // Handle skill drops (from actor sheet)
                await this._handleSkillDrop(data);
                ui.notifications.info("Added skill to starting skills.");
            } else {
            }
        } catch (err) {
            console.error("RaceSheet: Error handling drop:", err);
            ui.notifications.error("Error adding item: " + err.message);
        }
    }

    async _handleSkillDrop(data) {
        // Skills are stored by key in system.skills
        // We need to extract the skill key from the drop data
        let skillKey = null;
        
        if (data.uuid) {
            // Try to get skill from UUID (from actor sheet)
            const parts = data.uuid.split(".");
            if (parts.length > 0) {
                // Skill key might be in the UUID or we need to get it from the actor
                const actorId = parts[parts.length - 2];
                const skillId = parts[parts.length - 1];
                const actor = game.actors.get(actorId);
                if (actor) {
                    // Find skill by matching the skill structure
                    for (const [key, skill] of Object.entries(actor.system.skills || {})) {
                        if (skill.label === skillId || key === skillId) {
                            skillKey = key;
                            break;
                        }
                    }
                }
            }
        } else if (data.id) {
            skillKey = data.id;
        }
        
        if (skillKey) {
            const currentSkills = this.item.system.startingSkills || {};
            // Get skill label from config or use key
            const skillConfig = game.darkHeresy?.config?.skills?.[skillKey];
            const skillLabel = skillConfig?.label || skillKey;
            
            const updateData = {
                [`system.startingSkills.${skillKey}`]: {
                    label: skillLabel,
                    advance: 3 // "Known" by default (value 3)
                }
            };
            await this.item.update(updateData);
        }
    }

    async _handleItemDrop(item, targetPath) {
        if (!item) {
            console.warn("RaceSheet: _handleItemDrop called with null item");
            return;
        }
        
        
        // Store item reference - use UUID for compendium items, id for world items
        let itemRef = null;
        let itemName = item.name;
        
        if (item.uuid && item.uuid.includes("Compendium")) {
            // Compendium item - store UUID
            itemRef = item.uuid;
        } else {
            // World item - store id
            itemRef = item.id;
        }
        
        const currentList = foundry.utils.getProperty(this.item.system, targetPath) || [];
        
        // Check if already exists
        const exists = currentList.some(entry => {
            if (typeof entry === "string") {
                return entry === itemRef || entry === item.id || entry === item.uuid;
            }
            return entry.id === itemRef || entry.id === item.id || entry.uuid === item.uuid || 
                   (entry.id && item.id && entry.id === item.id);
        });
        
        if (exists) {
            ui.notifications.info(`${item.name} is already in the list.`);
            return;
        }
        
        // Store as object with id/uuid and name for better display
        const itemData = { 
            id: item.id || itemRef,
            uuid: item.uuid || null,
            name: itemName 
        };
        const newList = [...currentList, itemData];
        
        const updateData = {};
        updateData[`system.${targetPath}`] = newList;
        
        try {
            await this.item.update(updateData);
            // Refresh the sheet to show the new item
            this.render(false);
        } catch (err) {
            console.error("RaceSheet: Error updating item", err);
            ui.notifications.error("Error updating race: " + err.message);
        }
    }
}

const initializeHandlebars = () => {
    registerHandlebarsHelpers();
    preloadHandlebarsTemplates();
};

/**
 * Define a set of template paths to pre-load. Pre-loaded templates are compiled and cached for fast access when
 * rendering. These paths will also be available as Handlebars partials by using the file name.
 * @returns {Promise}
 */
function preloadHandlebarsTemplates() {
    const templatePaths = [
        "systems/dark-heresy/template/sheet/actor/acolyte.hbs",
        "systems/dark-heresy/template/sheet/actor/npc.hbs",
        "systems/dark-heresy/template/sheet/actor/limited-sheet.hbs",

        "systems/dark-heresy/template/sheet/actor/tab/abilities.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/combat.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/effects.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/gear.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/notes.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/npc-notes.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/npc-stats.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/progression.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/psychic-powers.hbs",
        "systems/dark-heresy/template/sheet/actor/tab/stats.hbs",

        "systems/dark-heresy/template/sheet/mental-disorder.hbs",
        "systems/dark-heresy/template/sheet/aptitude.hbs",
        "systems/dark-heresy/template/sheet/malignancy.hbs",
        "systems/dark-heresy/template/sheet/mutation.hbs",
        "systems/dark-heresy/template/sheet/talent.hbs",
        "systems/dark-heresy/template/sheet/trait.hbs",
        "systems/dark-heresy/template/sheet/special-ability.hbs",
        "systems/dark-heresy/template/sheet/race.hbs",
        "systems/dark-heresy/template/sheet/psychic-power.hbs",
        "systems/dark-heresy/template/sheet/critical-injury.hbs",
        "systems/dark-heresy/template/sheet/weapon.hbs",
        "systems/dark-heresy/template/sheet/armour.hbs",
        "systems/dark-heresy/template/sheet/gear.hbs",
        "systems/dark-heresy/template/sheet/drug.hbs",
        "systems/dark-heresy/template/sheet/tool.hbs",
        "systems/dark-heresy/template/sheet/cybernetic.hbs",
        "systems/dark-heresy/template/sheet/weapon-modification.hbs",
        "systems/dark-heresy/template/sheet/ammunition.hbs",
        "systems/dark-heresy/template/sheet/force-field.hbs",

        "systems/dark-heresy/template/sheet/item/effects.hbs",

        "systems/dark-heresy/template/sheet/characteristics/information.hbs",
        "systems/dark-heresy/template/sheet/characteristics/left.hbs",
        "systems/dark-heresy/template/sheet/characteristics/name.hbs",
        "systems/dark-heresy/template/sheet/characteristics/right.hbs",
        "systems/dark-heresy/template/sheet/characteristics/total.hbs",

        "systems/dark-heresy/template/chat/item.hbs",
        "systems/dark-heresy/template/chat/roll.hbs",
        "systems/dark-heresy/template/chat/damage.hbs",
        "systems/dark-heresy/template/chat/damage-mass.hbs",
        "systems/dark-heresy/template/chat/critical.hbs",
        "systems/dark-heresy/template/chat/evasion.hbs",
        "systems/dark-heresy/template/chat/evasion-mass.hbs",
        "systems/dark-heresy/template/chat/suppression.hbs",
        "systems/dark-heresy/template/chat/emptyMag.hbs",

        "systems/dark-heresy/template/dialog/common-roll.hbs",
        "systems/dark-heresy/template/dialog/combat-roll.hbs",
        "systems/dark-heresy/template/dialog/psychic-power-roll.hbs"
    ];
    return loadTemplates(templatePaths);
}

/**
 * Add custom Handlerbars helpers.
 */
function registerHandlebarsHelpers() {
    Handlebars.registerHelper("removeMarkup", function(text) {
        const markup = /<(.*?)>/gi;
        return text.replace(markup, "");
    });

    Handlebars.registerHelper("stripHtmlKeepBreaks", function(text) {
        if (text === null || text === undefined) return "";
        let value = String(text);
        // Convert common block/line tags to newlines before stripping markup.
        value = value.replace(/<\s*br\s*\/?>/gi, "\n");
        value = value.replace(/<\/\s*p\s*>/gi, "\n");
        value = value.replace(/<\s*p\s*>/gi, "");
        value = value.replace(/<\/\s*li\s*>/gi, "\n");
        value = value.replace(/<\s*li\s*>/gi, "- ");
        const markup = /<(.*?)>/gi;
        return value.replace(markup, "");
    });

    Handlebars.registerHelper("nl2br", function(text) {
        if (text === null || text === undefined) return "";
        const value = String(text).replace(/\r\n/g, "\n");
        const normalized = value.replace(/\n{3,}/g, "\n\n");
        return normalized.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
    });

    Handlebars.registerHelper("enrich", function(string) {
        return TextEditor.enrichHTML(string, {async: false});
    });

    Handlebars.registerHelper("damageTypeLong", function(damageType) {
        damageType = (damageType || "i").toLowerCase();
        switch (damageType) {
            case "e":
            case "energy":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY");
            case "i":
            case "impact":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
            case "r":
            case "rending":
                return game.i18n.localize("DAMAGE_TYPE.RENDING");
            case "x":
            case "explosive":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
        }
    });


    Handlebars.registerHelper("damageTypeShort", function(damageType) {
        switch (damageType) {
            case "energy":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY_SHORT");
            case "impact":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
            case "rending":
                return game.i18n.localize("DAMAGE_TYPE.RENDING_SHORT");
            case "explosive":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE_SHORT");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
        }
    });

    Handlebars.registerHelper("config", function(key) {
        return game.darkHeresy.config[key];
    });

    Handlebars.registerHelper("signed", function(value) {
        const num = Number(value) || 0;
        if (num > 0) return `+${num}`;
        if (num < 0) return `${num}`;
        return "0";
    });

    Handlebars.registerHelper("isNpc", function(actor) {
        return actor?.type === "npc";
    });

}

const migrateWorld = async () => {
    const schemaVersion = 6;
    const worldSchemaVersion = Number(game.settings.get("dark-heresy", "worldSchemaVersion"));
    if (worldSchemaVersion !== schemaVersion && game.user.isGM) {
        ui.notifications.info("Upgrading the world, please wait...");
        for (let actor of game.actors.contents) {
            try {
                const update = migrateActorData(actor, worldSchemaVersion);
                if (!isObjectEmpty(update)) {
                    await actor.update(update, {enforceTypes: false});
                }
            } catch(e) {
                console.error(e);
            }
        }
        for (let pack of
            game.packs.filter(p => p.metadata.package === "world" && ["Actor"].includes(p.metadata.type))) {
            await migrateCompendium(pack, worldSchemaVersion);
        }
        game.settings.set("dark-heresy", "worldSchemaVersion", schemaVersion);
        ui.notifications.info("Upgrade complete!");
    }
};

const migrateActorData = (actor, worldSchemaVersion) => {
    const update = {};
    if (worldSchemaVersion < 1) {
        if (actor.data.type === "acolyte" || actor.data.type === "npc") {
            actor.data.skills.psyniscience.characteristics = ["Per", "WP"];
            update["system.skills.psyniscience"] = actor.data.data.skills.psyniscience;
        }
    }
    if (worldSchemaVersion < 2) {
        if (actor.data.type === "acolyte" || actor.data.type === "npc") {

            let characteristic = actor.data.characteristics.intelligence.base;
            let advance = -20;
            let total = characteristic.total + advance;

            actor.data.data.skills.forbiddenLore.specialities.officioAssassinorum = {
                label: "Officio Assassinorum",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.pirates = {
                label: "Pirates",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.psykers = {
                label: "Psykers",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.theWarp = {
                label: "The Warp",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.xenos = {
                label: "Xenos",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            update["system.skills.forbiddenLore"] = actor.data.data.skills.forbiddenLore;
        }

    }

    // // migrate aptitudes
    if (worldSchemaVersion < 4) {
        if (actor.data.type === "acolyte" || actor.data.type === "npc") {

            let textAptitudes = actor.data.data?.aptitudes;

            if (textAptitudes !== null && textAptitudes !== undefined) {
                let aptitudeItemsData =
                    Object.values(textAptitudes)
                    // Be extra careful and filter out bad data because the existing data is bugged
                        ?.filter(textAptitude =>
                            "id" in textAptitude
                        && textAptitude?.name !== null
                        && textAptitude?.name !== undefined
                        && typeof textAptitude?.name === "string"
                        && 0 !== textAptitude?.name?.trim().length)
                        ?.map(textAptitude => {
                            return {
                                name: textAptitude.name,
                                type: "aptitude",
                                isAptitude: true,
                                img: "systems/dark-heresy/asset/icons/aptitudes/aptitude400.png"
                            };
                        });
                if (aptitudeItemsData !== null && aptitudeItemsData !== undefined) {
                    actor.createEmbeddedDocuments("Item", [aptitudeItemsData]);
                }
            }
            update["system.-=aptitudes"] = null;
        }
    }
    if (worldSchemaVersion < 3) {
        actor.prepareData();
        update["system.armour"] = actor.data.armour;
    }

    if (worldSchemaVersion < 5) {
        actor.prepareData();
        let experience = actor.data.data?.experience;
        let value = (experience?.value || 0) + (experience?.totalspent || 0);
        // In case of an Error in the calculation don't do anything loosing data is worse
        // than doing nothing in this case since the user can easily do this himself
        if (!isNaN(value) && value !== undefined) {
            update["system.experience.value"] = value;
        }
    }

    if (worldSchemaVersion < 6) {
        actor.prepareData();
        if (actor.type === "npc") {
            if (actor.system.bio?.notes) {
                actor.system.notes = actor.system.bio.notes;
            }
        }
    }

    return update;
};

/**
 * Migrate Data in Compendiums
 * @param {CompendiumCollection} pack
 * @param {number} worldSchemaVersion
 * @returns {Promise<void>}
 */
const migrateCompendium = async function(pack, worldSchemaVersion) {
    const entity = pack.metadata.type;

    await pack.migrate();
    const content = await pack.getContent();

    for (let ent of content) {
        let updateData = {};
        if (entity === "Actor") {
            updateData = migrateActorData(ent, worldSchemaVersion);
        }
        if (!isObjectEmpty(updateData)) {
            foundry.utils.expandObject(updateData);
            updateData._id = ent.id;
            await pack.updateEntity(updateData);
        }
    }
};

/**
 * Listeners for Chatmessages
 * @param {HTMLElement} html
 */
function chatListeners(html) {
    html.on("click", ".invoke-test", onTestClick.bind(this));
    html.on("click", ".invoke-damage", onDamageClick.bind(this));
    html.on("click", ".invoke-suppression", onSuppressionClick.bind(this));
    html.on("dblclick", ".dark-heresy.chat.roll>.background.border", onChatRollClick.bind(this));
    html.on("dblclick", ".dark-heresy.chat.damage-card .roll-card-background", onDamageCardClick.bind(this));
    html.on("click", ".dh-chat-target", onChatTargetClick.bind(this));
    html.on("click", ".manual-damage-undo", onManualDamageUndoClick.bind(this));
}

/**
 * This function is used to hook into the Chat Log context menu to add additional options to each message
 * These options make it easy to conveniently apply damage to controlled tokens based on the value of a Roll
 *
 * @param {HTMLElement} html    The Chat Message being rendered
 * @param {Array} options       The Array of Context Menu options
 *
 * @returns {Array}              The extended options Array including new context choices
 */
const addChatMessageContextOptions = function(html, options) {
    let canApply = li => {
        const message = game.messages.get(li.data("messageId"));
        return message.getRollData()?.flags.isDamageRoll
            && message.isContentVisible
            && canvas.tokens.controlled.length;
    };
    options.push(
        {
            name: game.i18n.localize("CHAT.CONTEXT.APPLY_DAMAGE"),
            icon: '<i class="fas fa-user-minus"></i>',
            condition: canApply,
            callback: li => applyChatCardDamage(li)
        }
    );

    let canReroll = li => {
        const message = game.messages.get(li.data("messageId"));
        let actor = game.actors.get(message.getRollData()?.ownerId);
        return message.isRoll
            && !message.getRollData()?.flags.isDamageRoll
            && message.isContentVisible
            && actor?.fate.value > 0;
    };

    options.push(
        {
            name: game.i18n.localize("CHAT.CONTEXT.REROLL"),
            icon: '<i class="fa-solid fa-repeat"></i>',
            condition: canReroll,
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                rerollTest(message.getRollData());
            }
        }
    );

    const canBlast = li => {
        if (!game.user.isGM) return false;
        const message = game.messages.get(li.data("messageId"));
        return message?.isContentVisible
            && message.getRollData()?.flags?.isMassEvasion;
    };
    options.push(
        {
            name: game.i18n.localize("MASS_DAMAGE_MODE.BLAST"),
            icon: '<i class="fas fa-bomb"></i>',
            condition: canBlast,
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                applyBlastFromMassEvasion(message);
            }
        }
    );
    return options;
};

/**
 * Apply rolled dice damage to the token or tokens which are currently controlled.
 * This allows for damage to be scaled by a multiplier to account for healing, critical hits, or resistance
 *
 * @param {HTMLElement} roll    The chat entry which contains the roll data
 * @param {number} multiplier   A damage multiplier to apply to the rolled damage.
 * @returns {Promise}
 */
function applyChatCardDamage(roll, multiplier) {
    // Get the damage data, get them as arrays in case of multiple hits
    const amount = roll.find(".damage-total");
    const location = roll.find(".damage-location");
    const penetration = roll.find(".damage-penetration");
    const type = roll.find(".damage-type");
    const righteousFury = roll.find(".damage-righteous-fury");

    // Put the data from different hits together
    const damages = [];
    for (let i = 0; i < amount.length; i++) {
        // Parse penetration value, removing any whitespace and converting to number
        const penetrationText = $(penetration[i]).text().trim();
        const penetrationValue = penetrationText ? Number(penetrationText) : 0;
        
        damages.push({
            amount: $(amount[i]).text(),
            location: $(location[i]).data("location"),
            penetration: penetrationValue,
            type: $(type[i]).text(),
            righteousFury: $(righteousFury[i]).text()
        });
    }

    // Apply to any selected actors
    return Promise.all(canvas.tokens.controlled.map(t => {
        const a = t.actor;
        return a.applyDamage(damages);
    }));
}

async function applyAutoDamageToTarget(rollData, message, options = {}) {
    let target = rollData?.targets?.[0];
    if (!target) {
        const currentTargets = DarkHeresyUtil.getCurrentTargets();
        if (currentTargets.length) {
            target = currentTargets[0];
            rollData.targets = [target];
        }
    }
    if (!target || !message) return;
    if (!canvas?.ready) return;
    if (target.sceneId && canvas.scene?.id !== target.sceneId) {
        ui.notifications.warn(game.i18n.localize("NOTIFICATION.TARGET_DIFFERENT_SCENE") || "Target is in another scene.");
        return;
    }
    let token = canvas.tokens.get(target.tokenId);
    if (!token) {
        const currentTargets = DarkHeresyUtil.getCurrentTargets();
        if (currentTargets.length) {
            target = currentTargets[0];
            rollData.targets = [target];
            token = canvas.tokens.get(target.tokenId);
        }
    }
    if (!token?.actor) return;

        const damages = (rollData.damages || []).map(damage => ({
        amount: Number(damage.total) || 0,
        location: damage.location,
        penetration: Number(damage.penetration) || 0,
        type: rollData.weapon?.damageType,
            righteousFury: damage.righteousFury,
            attackDos: rollData.attackDos,
            weaponClass: rollData.weapon?.weaponClass,
            weaponType: rollData.weapon?.weaponType,
            weaponTraits: damage.weaponTraits || rollData.weapon?.traits || {}, // Pass weapon traits for trait-based checks (prefer from damage object)
            devastating: rollData.weapon?.traits?.devastating // Pass devastating value for horde reduction
    }));
    if (!damages.length) return;

    if (!token.actor.isOwner && !game.user.isGM) {
        game.socket.emit("system.dark-heresy", {
            type: "autoDamage",
            payload: {
                sceneId: target.sceneId || canvas.scene?.id,
                tokenId: target.tokenId,
                messageId: message.id,
                damages,
                force: !!options.force
            }
        });
        return;
    }

    const preview = token.actor.previewDamage(damages);
    const before = {
        wounds: token.actor.wounds.value,
        critical: token.actor.wounds.critical
    };
    token.actor._damageSourceMessageId = message.id;
    token.actor._suppressCritChat = true;
    try {
    await token.actor.applyDamage(damages);
    } finally {
        token.actor._suppressCritChat = false;
    }
    delete token.actor._damageSourceMessageId;
    const after = {
        wounds: token.actor.wounds.value,
        critical: token.actor.wounds.critical
    };
    const applied = {
        tokenId: target.tokenId,
        sceneId: target.sceneId,
        woundsDelta: after.wounds - before.wounds,
        criticalDelta: after.critical - before.critical,
        woundsBefore: before.wounds,
        woundsAfter: after.wounds,
        criticalBefore: before.critical,
        criticalAfter: after.critical
    };
    rollData.appliedDetails = preview.damageTaken || [];
    rollData.applied = { wounds: after.wounds, critical: after.critical };
    await message.setFlag("dark-heresy", "appliedDamage", applied);
    await message.setFlag("dark-heresy", "rollData", rollData);
    const html = await renderTemplate("systems/dark-heresy/template/chat/damage.hbs", rollData);
    await message.update({ content: html });
}

async function applyAutoDamageFromSocket(payload) {
    if (!game.user.isGM) return;
    if (!payload?.sceneId || !payload?.tokenId || !payload?.damages?.length) return;

    const scene = game.scenes.get(payload.sceneId);
    const tokenDoc = scene?.tokens?.get(payload.tokenId);
    const actor = tokenDoc?.actor || game.actors.get(tokenDoc?.actorId);
    if (!actor) return;

    const preview = actor.previewDamage(payload.damages);
    const before = {
        wounds: actor.wounds.value,
        critical: actor.wounds.critical
    };
    actor._damageSourceMessageId = payload.messageId;
    actor._suppressCritChat = true;
    try {
    await actor.applyDamage(payload.damages);
    } finally {
        actor._suppressCritChat = false;
    }
    delete actor._damageSourceMessageId;
    const after = {
        wounds: actor.wounds.value,
        critical: actor.wounds.critical
    };

    if (payload.messageId) {
        const message = game.messages.get(payload.messageId);
        if (message) {
            const applied = {
                tokenId: payload.tokenId,
                sceneId: payload.sceneId,
                woundsDelta: after.wounds - before.wounds,
            criticalDelta: after.critical - before.critical,
            woundsBefore: before.wounds,
            woundsAfter: after.wounds,
            criticalBefore: before.critical,
            criticalAfter: after.critical
            };
            const rollData = message.getRollData?.();
        if (rollData) {
                rollData.appliedDetails = preview.damageTaken || [];
                rollData.applied = { wounds: after.wounds, critical: after.critical };
            await message.setFlag("dark-heresy", "rollData", rollData);
                const html = await renderTemplate("systems/dark-heresy/template/chat/damage.hbs", rollData);
                await message.update({ content: html });
            }
            await message.setFlag("dark-heresy", "appliedDamage", applied);
        }
    }
}


/**
 * Rerolls the Test using the same Data as the initial Roll while reducing an actors fate
 * @param {object} rollData
 * @returns {Promise}
 */
function rerollTest(rollData) {
    let actor = game.actors.get(rollData.ownerId);
    actor.update({ "system.fate.value": actor.fate.value -1 });
    delete rollData.damages; // Reset so no old data is shown on failure

    rollData.flags.isReRoll = true;
    if (rollData.flags.isCombatRoll) {
    // All the regexes in this are broken once retrieved from the chatmessage
    // No idea why this happens so we need to fetch them again so the roll works correctly
        rollData.attributeBoni = actor.attributeBoni;
        return combatRoll(rollData);
    } else {
        return commonRoll(rollData);
    }
}

/**
 * Rolls a Test for the Selected Actor
 * @param {Event} ev
 */
function onTestClick(ev) {
    let id = $(ev.currentTarget).parents(".message").attr("data-message-id");
    let msg = game.messages.get(id);
    let rollData = msg.getRollData();
    if (rollData?.flags?.isAttack && rollData?.flags?.isSuccess === false) return;
    rollData.sourceMessageId = id;
    const currentTargets = DarkHeresyUtil.getCurrentTargets();
    const fallbackTargets = Array.isArray(rollData?.targets) ? rollData.targets : [];
    if (game.user.isGM && currentTargets.length > 1) {
        rollData.targets = currentTargets;
        rollData.massEvasionResults = [];
        rollData.massEvasion = rollData.massEvasion || { selected: "dodge", modifier: 0 };
        rollData.massEvasion.modifier = Number(rollData.evasionModifier) || 0;
        return prepareMassEvasionRoll(rollData);
    }
    const targets = currentTargets.length
        ? currentTargets
        : fallbackTargets;
    rollData.targets = targets.length ? [targets[0]] : undefined;
    let actor = null;
    const target = rollData?.targets?.[0];
    if (target && canvas?.ready) {
        if (!target.sceneId || canvas.scene?.id === target.sceneId) {
            actor = canvas.tokens.get(target.tokenId)?.actor || null;
        } else {
            ui.notifications.warn(game.i18n.localize("NOTIFICATION.TARGET_DIFFERENT_SCENE") || "Target is in another scene.");
        }
    }
    if (!actor) {
        actor = game.macro.getActor();
    }

    if (!actor) {
        ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ACTOR_NOT_FOUND")}`);
        return;
    }
    let evasions = {
        dodge: DarkHeresyUtil.createSkillRollData(actor, "dodge"),
        parry: DarkHeresyUtil.createSkillRollData(actor, "parry"),
        deny: DarkHeresyUtil.createCharacteristicRollData(actor, "willpower"),
        willpower: DarkHeresyUtil.createCharacteristicRollData(actor, "willpower"),
        toughness: DarkHeresyUtil.createCharacteristicRollData(actor, "toughness"),
        agility: DarkHeresyUtil.createCharacteristicRollData(actor, "agility"),
        strength: DarkHeresyUtil.createCharacteristicRollData(actor, "strength"),
        selected: "dodge"
    };
    rollData.evasions = evasions;
    rollData.target.modifier = Number(rollData.evasionModifier) || 0;
    rollData.flags.isEvasion = true;
    rollData.flags.isAttack = false;
    rollData.flags.isDamageRoll = false;
    rollData.flags.isCombatRoll = false;
    if (rollData.psy) rollData.psy.display = false;
    rollData.evasionActor = actor.name;
    if (target?.tokenId) rollData.evasionActorTokenId = target.tokenId;
    if (target?.sceneId) rollData.evasionActorSceneId = target.sceneId;
    if (!rollData.evasionActorTokenId && actor?.token?.id) {
        rollData.evasionActorTokenId = actor.token.id;
    }
    if (!rollData.evasionActorSceneId && actor?.token?.scene?.id) {
        rollData.evasionActorSceneId = actor.token.scene.id;
    }
    rollData.name = `${game.i18n.localize("DIALOG.EVASION")}: ${actor.name}`;
    prepareCommonRoll(rollData);
}

async function onSuppressionClick(ev) {
    let id = $(ev.currentTarget).parents(".message").attr("data-message-id");
    let msg = game.messages.get(id);
    let attackRollData = msg.getRollData();
    const currentTargets = DarkHeresyUtil.getCurrentTargets();
    let actor = null;
    if (currentTargets.length) {
        const target = currentTargets[0];
        if (!target.sceneId || canvas.scene?.id === target.sceneId) {
            actor = canvas.tokens.get(target.tokenId)?.actor || null;
        }
    }
    if (!actor) {
        actor = game.macro.getActor();
    }
    if (!actor) {
        ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ACTOR_NOT_FOUND")}`);
            return;
        }

    let rollData = DarkHeresyUtil.createFearTestRolldata(actor);
    rollData.target.modifier = "";
    if (attackRollData.suppressionLength === "full") {
        rollData.suppressionModifier = -20;
    } else {
        rollData.suppressionModifier = -10;
    }
    rollData.name = game.i18n.localize("SUPPRESSION.HEADER");
    rollData.flags = {
        isAttack: false,
        isDamageRoll: false,
        isCombatRoll: false,
        isSuppressionTest: true
    };

    const html = await renderTemplate("systems/dark-heresy/template/dialog/common-roll.hbs", rollData);
    let dialog = new Dialog({
        title: game.i18n.localize("SUPPRESSION.HEADER"),
        content: html,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    const baseModifier = parseInt(html.find("#modifier")[0]?.value, 10) || 0;
                    const suppressionModifier = Number(rollData.suppressionModifier) || 0;
                    rollData.target.modifier = baseModifier + suppressionModifier;
                    await _computeCommonTarget(rollData);
                    await _rollTarget(rollData);
                    rollData.target.modifier = baseModifier;
                    if (!rollData.flags.isSuccess) {
                        await addFearCondition(actor);
                    }
                    await _sendSuppressionToChat(rollData, actor.name);
}
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }
        },
        default: "roll",
        close: () => {},
        render: html => {
            const sel = html.find("select[name=characteristic");
            const target = html.find("#target");
            sel.change(() => {
                target.val(sel.val());
            });
        }
    }, { width: 200 });
    dialog.render(true);
}

async function addFearCondition(actor) {
    const tokens = actor.getActiveTokens();
    if (tokens.length > 0) {
        const fearEffect = CONFIG.statusEffects.find(effect => effect.id === "fear");
        if (!fearEffect) {
            console.error("Fear effect not found in CONFIG.statusEffects");
            ui.notifications.error(game.i18n.localize("SUPPRESSION.FEAR_EFFECT_NOT_FOUND"));
            return;
        }
        for (let token of tokens) {
            try {
                await token.actor.toggleStatusEffect(fearEffect.id);
            } catch (error) {
                console.error(`Failed to add fear effect to token ${token.name}:`, error);
                try {
                    const currentEffects = token.document.effects || [];
                    await token.document.update({
                        effects: [...currentEffects, fearEffect.img]
                    });
                } catch (error2) {
                    console.error(`Alternative method also failed for token ${token.name}:`, error2);
                }
            }
        }
        ui.notifications.info(`${actor.name} ${game.i18n.localize("SUPPRESSION.FEAR_ADDED")}`);
    } else {
        ui.notifications.warn(game.i18n.localize("SUPPRESSION.NO_TOKEN_FOUND"));
}
}

async function _sendSuppressionToChat(rollData, targetName) {
    let speaker = ChatMessage.getSpeaker();
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        speaker: speaker,
        flags: {
            "dark-heresy.rollData": rollData
        }
    };
    if (rollData.rollObject) {
        rollData.render = await rollData.rollObject.render();
        chatData.rolls = [rollData.rollObject];
}
    const html = await renderTemplate("systems/dark-heresy/template/chat/suppression.hbs", {
        ...rollData,
        targetName: targetName,
        hasFear: !rollData.flags.isSuccess
    });
    chatData.content = html;
    if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user];
    }
    ChatMessage.create(chatData);
}

async function prepareMassEvasionRoll(rollData) {
    if (!game.user.isGM) return;
    rollData.massEvasion = rollData.massEvasion || { selected: "dodge", modifier: 0 };
    const options = [
        { value: "dodge", label: "SKILL.DODGE" },
        { value: "parry", label: "SKILL.PARRY" },
        { value: "deny", label: "DIALOG.DENY_THE_WITCH" },
        { value: "toughness", label: "CHARACTERISTIC.TOUGHNESS" },
        { value: "willpower", label: "CHARACTERISTIC.WILLPOWER" },
        { value: "strength", label: "CHARACTERISTIC.STRENGTH" },
        { value: "agility", label: "CHARACTERISTIC.AGILITY" }
    ];
    const selectOptions = options
        .map(opt => {
            const label = game.i18n.localize(opt.label);
            const selected = opt.value === rollData.massEvasion.selected ? "selected" : "";
            return `<option value="${opt.value}" ${selected}>${label}</option>`;
        })
        .join("");
    const content = `
        <div class="dark-heresy dialog">
            <div class="flex row wrap background border" style="flex-basis:100%;margin-bottom:5px">
                <div class="wrapper">
                    <label>${game.i18n.localize("CHAT.DEFENSE")}</label>
                    <select id="massEvasion">${selectOptions}</select>
                </div>
            </div>
        </div>
    `;
    const dialog = new Dialog({
        title: game.i18n.localize("CHAT.MASS_EVASION_RESULTS"),
        content,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async dlgHtml => {
                    rollData.massEvasion.selected = dlgHtml.find("#massEvasion")[0]?.value || "dodge";
                    await massEvasionRoll(rollData);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }
        },
        default: "roll"
    }, { width: 260 });
    dialog.render(true);
}

async function massEvasionRoll(rollData) {
    if (!game.user.isGM) return;
    let targets = Array.isArray(rollData.targets) ? rollData.targets : [];
    if (!targets.length || !canvas?.ready) return;
    const selected = rollData.massEvasion?.selected || "dodge";
    const modifier = Number(rollData.massEvasion?.modifier) || 0;
    const results = [];
    const selectedValues = [];

    for (const target of targets) {
        if (target.sceneId && canvas.scene?.id !== target.sceneId) continue;
        const token = canvas.tokens.get(target.tokenId);
        const actor = token?.actor;
        if (!actor) continue;

        let perRollData;
        if (selected === "dodge" || selected === "parry") {
            if (!actor.skills?.[selected]) {
                results.push({ target, error: true });
                continue;
            }
            perRollData = DarkHeresyUtil.createSkillRollData(actor, selected);
            const skillTotal = actor.skills?.[selected]?.total;
            if (Number.isFinite(skillTotal)) selectedValues.push(skillTotal);
        } else if (selected === "willpower" || selected === "toughness" || selected === "strength" || selected === "agility") {
            if (!actor.characteristics?.[selected]) {
                results.push({ target, error: true });
                continue;
            }
            perRollData = DarkHeresyUtil.createCharacteristicRollData(actor, selected);
            const charTotal = actor.characteristics?.[selected]?.total;
            if (Number.isFinite(charTotal)) selectedValues.push(charTotal);
        } else if (selected === "deny") {
            if (!actor.characteristics?.willpower) {
                results.push({ target, error: true });
                continue;
            }
            perRollData = DarkHeresyUtil.createCharacteristicRollData(actor, "willpower");
            const charTotal = actor.characteristics?.willpower?.total;
            if (Number.isFinite(charTotal)) selectedValues.push(charTotal);
        } else {
            if (!actor.skills?.dodge) {
                results.push({ target, error: true });
                continue;
            }
            perRollData = DarkHeresyUtil.createSkillRollData(actor, "dodge");
            const skillTotal = actor.skills?.dodge?.total;
            if (Number.isFinite(skillTotal)) selectedValues.push(skillTotal);
        }

        perRollData.target.modifier = modifier;
        await _computeCommonTarget(perRollData);
        await _rollTarget(perRollData);

        results.push({
            target,
            result: perRollData.result,
            isSuccess: perRollData.flags.isSuccess,
            dos: perRollData.dos || 0,
            dof: perRollData.dof || 0,
            targetBase: perRollData.target.base,
            targetModifier: perRollData.target.modifier,
            targetFinal: perRollData.target.final
        });
    }

    rollData.massEvasionResults = results;
    rollData.flags.isEvasion = true;
    rollData.flags.isMassEvasion = true;
    const evasionKey = {
        dodge: "SKILL.DODGE",
        parry: "SKILL.PARRY",
        deny: "DIALOG.DENY_THE_WITCH",
        toughness: "CHARACTERISTIC.TOUGHNESS",
        willpower: "CHARACTERISTIC.WILLPOWER",
        strength: "CHARACTERISTIC.STRENGTH",
        agility: "CHARACTERISTIC.AGILITY"
    }[selected] || selected;
    rollData.massEvasionLabel = game.i18n.localize(evasionKey);
    rollData.massEvasionModifier = modifier;
    rollData.name = game.i18n.localize("CHAT.MASS_EVASION_RESULTS");

    await sendMassEvasionToChat(rollData);
}

async function sendMassEvasionToChat(rollData) {
    let speaker = ChatMessage.getSpeaker();
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        speaker: speaker,
        flags: {
            "dark-heresy.rollData": rollData
        }
    };
    if (speaker.token) {
        rollData.tokenId = speaker.token;
    }
    const html = await renderTemplate("systems/dark-heresy/template/chat/evasion-mass.hbs", rollData);
    chatData.content = html;
    if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user];
    }
    ChatMessage.create(chatData);
}

async function sendMassDamageToChat(rollData) {
    let speaker = ChatMessage.getSpeaker();
    rollData.canRevert = _canManageDamageRevert();
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        speaker: speaker,
        flags: {
            "dark-heresy.rollData": rollData
        }
    };
    if (speaker.token) {
        rollData.tokenId = speaker.token;
    }
    
    // Normalize damage type like in sendDamageToChat
    const actor = rollData.ownerId ? game.actors.get(rollData.ownerId) : null;
    const item = actor?.items?.get(rollData.itemId);
    if (!rollData.weapon) rollData.weapon = {};
    if (!rollData.weapon.damageType || rollData.weapon.damageType === "none") {
        const fallbackType = item?.damageType
            || item?.system?.damageType
            || item?.system?.damage?.type;
        rollData.weapon.damageType = _normalizeDamageType(fallbackType);
    } else {
        rollData.weapon.damageType = _normalizeDamageType(rollData.weapon.damageType);
    }
    
    chatData.rolls = rollData.multiDamages
        .flatMap(entry => entry.damages || [])
        .flatMap(r => r.damageRoll || []);
    const html = await renderTemplate("systems/dark-heresy/template/chat/damage-mass.hbs", rollData);
    chatData.content = html;
    if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user];
    }
    return ChatMessage.create(chatData);
}

async function applyBlastFromMassEvasion(message) {
    if (!game.user.isGM || !message) return;
    const rollData = message.getRollData?.();
    const results = Array.isArray(rollData?.massEvasionResults) ? rollData.massEvasionResults : [];
    if (!results.length || !canvas?.ready) return;
    const failed = results.filter(result => !result.isSuccess && result.target?.tokenId);
    if (!failed.length) {
        ui.notifications.info(game.i18n.localize("CHAT.NO_DAMAGE") || "No damage.");
        return;
                    }

    const hordeBonusDice = _getHordeDamageBonusDiceFromActor(game.actors.get(rollData.ownerId));
    const blastRollData = {
                        ownerId: rollData.ownerId,
                        itemId: rollData.itemId,
                        weapon: rollData.weapon,
                        attackDos: rollData.attackDos,
                        aim: rollData.aim,
                        attackResult: rollData.attackResult,
        hordeDamageBonusDice: hordeBonusDice,
        hordeBonusApplied: hordeBonusDice > 0,
        multiDamages: [],
        massDamageModeLabel: game.i18n.localize("MASS_DAMAGE_MODE.BLAST")
    };

    const appliedEntries = [];
    for (const entry of failed) {
        const target = entry.target;
        if (target.sceneId && canvas.scene?.id !== target.sceneId) continue;
        const token = canvas.tokens.get(target.tokenId);
        if (!token?.actor) continue;

        const perTargetRollData = {
            ownerId: blastRollData.ownerId,
            weapon: blastRollData.weapon,
            attackDos: blastRollData.attackDos,
            aim: blastRollData.aim,
            numberOfHits: 1,
            attackResult: blastRollData.attackResult,
            hordeDamageBonusDice: blastRollData.hordeDamageBonusDice,
            hordeBonusApplied: blastRollData.hordeBonusApplied
        };
        await _rollDamage(perTargetRollData);

        // Check if damages were generated
        if (!perTargetRollData.damages || !perTargetRollData.damages.length) {
            console.warn("Dark Heresy: No damages generated for blast target", target);
            continue;
        }

        const damages = (perTargetRollData.damages || []).map(damage => ({
            amount: Number(damage.total) || 0,
            location: damage.location,
            penetration: Number(damage.penetration) || 0,
            type: blastRollData.weapon?.damageType,
            righteousFury: damage.righteousFury,
            attackDos: blastRollData.attackDos,
            weaponClass: blastRollData.weapon?.weaponClass,
            weaponType: blastRollData.weapon?.weaponType,
            weaponTraits: blastRollData.weapon?.traits || {}, // Pass weapon traits for trait-based checks
            devastating: blastRollData.weapon?.traits?.devastating // Pass devastating value for horde reduction
        }));
        const preview = token.actor.previewDamage(damages);

        const before = {
            wounds: token.actor.wounds.value,
            critical: token.actor.wounds.critical
        };
        token.actor._suppressCritChat = true;
        try {
            await token.actor.applyDamage(damages);
        } finally {
            token.actor._suppressCritChat = false;
        }
        const after = {
            wounds: token.actor.wounds.value,
            critical: token.actor.wounds.critical
        };

        const appliedDetails = (preview.damageTaken || []).map(detail => ({
            ...detail,
            armour: token.actor._getArmourTotal(detail.location)
        }));

        blastRollData.multiDamages.push({
            target,
            numberOfHits: 1,
            damages: perTargetRollData.damages,
            appliedDetails,
            applied: { wounds: after.wounds, critical: after.critical }
        });

        appliedEntries.push({
            tokenId: target.tokenId,
            sceneId: target.sceneId,
            woundsDelta: after.wounds - before.wounds,
            criticalDelta: after.critical - before.critical,
            woundsBefore: before.wounds,
            woundsAfter: after.wounds,
            criticalBefore: before.critical,
            criticalAfter: after.critical
        });
    }

    if (!blastRollData.multiDamages.length) return;
    const damageMessage = await sendMassDamageToChat(blastRollData);
    if (appliedEntries.length) {
        await damageMessage.setFlag("dark-heresy", "appliedDamage", appliedEntries);
    }
}

/**
 * Rolls an Evasion chat for the currently selected character from the chatcard
 * @param {Event} ev
 * @returns {Promise}
 */
function onDamageClick(ev) {
    let id = $(ev.currentTarget).parents(".message").attr("data-message-id");
    let msg = game.messages.get(id);
    let rollData = msg.getRollData();
    if (rollData?.flags?.isEvasion && rollData?.flags?.isSuccess) {
        const hits = Number(rollData?.numberOfHits) || 0;
        if (hits <= 0) return;
    }
    if (rollData?.flags?.isAttack && rollData?.flags?.isSuccess === false) return;
    rollData.sourceMessageId = id;
    if (rollData?.flags?.isEvasion) {
        const manualCountTypes = new Set(["semi_auto", "full_auto", "barrage", "storm", "lightning", "swift"]);
        const isManualCountMode = manualCountTypes.has(rollData?.attackType?.name);
        const hits = Number(rollData?.numberOfHits) || 0;
        if (!isManualCountMode && hits <= 0) {
            ui.notifications.warn(game.i18n.localize("CHAT.NO_DAMAGE") || "No damage.");
                        return;
                    }
    }
    if (_isHordeTarget(rollData)) {
        const target = _getCurrentTargetForDamage(rollData);
        if (target) {
            rollData.targets = [target];
                }
        rollData.flags.isEvasion = false;
        rollData.flags.isCombatRoll = false;
        rollData.flags.isDamageRoll = true;
        return damageRoll(rollData);
        }
    rollData.flags.isEvasion = false;
    rollData.flags.isCombatRoll = false;
    rollData.flags.isDamageRoll = true;
    return damageRoll(rollData);
}


function _isHordeTarget(rollData) {
        const target = _getCurrentTargetForDamage(rollData);
    if (!target || !canvas?.ready) return false;
    if (target.sceneId && canvas.scene?.id !== target.sceneId) return false;
    const token = canvas.tokens.get(target.tokenId);
    const hordeValue = Number(token?.actor?.system?.horde) || 0;
    return hordeValue > 0;
}

function _getCurrentTargetForDamage(rollData) {
    const currentTargets = DarkHeresyUtil.getCurrentTargets();
    if (currentTargets.length) return currentTargets[0];
    const targets = Array.isArray(rollData?.targets) ? rollData.targets : [];
    return targets[0] || null;
}



/**
 * Show/hide dice rolls when a chat message is clicked.
 * @param {Event} event
 */
function onChatRollClick(event) {
    event.preventDefault();
    let roll = $(event.currentTarget.parentElement);
    let tip = roll.find(".dice-rolls");
    if ( !tip.is(":visible") ) tip.slideDown(200);
    else tip.slideUp(200);
}

function onDamageCardClick(event) {
    event.preventDefault();
    let card = $(event.currentTarget.closest(".damage-card"));
    let tip = card.find(".dice-rolls");
    if ( !tip.is(":visible") ) tip.slideDown(200);
    else tip.slideUp(200);
}

function _showWoundsFloat(actor, delta, options = {}) {
    if (!canvas?.ready) return;
    if (!Number.isFinite(delta) || delta === 0) return;
    const tokens = actor?.getActiveTokens?.(true) || [];
    if (!tokens.length) return;
    const effectiveDelta = options.invert ? -delta : delta;
    const isDamage = effectiveDelta > 0;
    const amount = Math.abs(effectiveDelta);
    let text = isDamage ? `-${amount}` : `+${amount}`;
    let color = isDamage ? 0xe74c3c : 0x2ecc71;
    let fontSize = 28;
    let duration = 2500;
    let strokeThickness = 4;
    if (options.effect === "regen") {
        text = `+${amount} REGEN`;
        color = 0x00ffb0;
        fontSize = 36;
        duration = 3200;
        strokeThickness = 6;
    }
    for (const token of tokens) {
        const center = token.center || token.getCenter();
        const distance = token.h || 30;
        canvas.interface?.createScrollingText(center, text, {
            anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
            direction: CONST.TEXT_ANCHOR_POINTS.TOP,
            distance,
            duration,
            fontSize,
            fill: color,
            stroke: 0x000000,
            strokeThickness
        });
    }
}

function _canManageDamageRevert() {
    return !!(game.user?.isGM || game.user?.role >= CONST.USER_ROLES.ASSISTANT);
}

Hooks.on("preUpdateActor", (actor, changes) => {
    if (actor?._suppressWoundsFloat) return;
    const hasWounds = foundry.utils.getProperty(changes, "system.wounds.value") !== undefined
        || foundry.utils.getProperty(changes, "system.wounds.critical") !== undefined;
    const hasHorde = foundry.utils.getProperty(changes, "system.horde") !== undefined;
    if (!hasWounds && !hasHorde) return;
    actor._woundsFloatPrev = {
        wounds: Number(actor.system?.wounds?.value) || 0,
        critical: Number(actor.system?.wounds?.critical) || 0,
        horde: Number(actor.system?.horde) || 0
    };
});

Hooks.on("updateActor", (actor, changes) => {
    if (actor?._suppressWoundsFloat) return;
    const prev = actor._woundsFloatPrev;
    delete actor._woundsFloatPrev;
    if (!prev) return;
    const hasWounds = foundry.utils.getProperty(changes, "system.wounds.value") !== undefined
        || foundry.utils.getProperty(changes, "system.wounds.critical") !== undefined;
    const hasHorde = foundry.utils.getProperty(changes, "system.horde") !== undefined;
    if (hasWounds) {
        const newTotal = (Number(actor.system?.wounds?.value) || 0) + (Number(actor.system?.wounds?.critical) || 0);
        const oldTotal = (Number(prev.wounds) || 0) + (Number(prev.critical) || 0);
        _showWoundsFloat(actor, newTotal - oldTotal);
    }
    if (hasHorde) {
        const newHorde = Number(actor.system?.horde) || 0;
        const oldHorde = Number(prev.horde) || 0;
        _showWoundsFloat(actor, newHorde - oldHorde, { invert: true });
    }
});

async function onManualDamageUndoClick(event) {
    event.preventDefault();
    if (!_canManageDamageRevert()) return;
    const button = $(event.currentTarget);
    const messageId = button.closest(".message").data("messageId");
    const message = game.messages.get(messageId);
    if (!message) return;

    const confirmed = await Dialog.confirm({
        title: game.i18n.localize("CHAT.MANUAL_DAMAGE"),
        content: `<p>${game.i18n.localize("CHAT.CONFIRM_REVERT")}</p>`,
        defaultYes: false
    });
    if (!confirmed) return;

    const applied = message.getFlag("dark-heresy", "appliedDamage");
    if (!applied) {
        ui.notifications.warn("No applied damage to revert.");
        return;
    }
    if (!canvas?.ready) return;
    const entries = Array.isArray(applied) ? applied : [applied];
    let revertedAny = false;

    for (const entry of entries) {
        if (entry.reverted) continue;
        if (entry.sceneId && canvas.scene?.id !== entry.sceneId) {
            continue;
        }
        const token = canvas.tokens.get(entry.tokenId);
        if (!token?.actor) continue;

        const actor = token.actor;
        const beforeTotal = (Number(actor.wounds.value) || 0) + (Number(actor.wounds.critical) || 0);
        const newWounds = Math.max(actor.wounds.value - (entry.woundsDelta || 0), 0);
        const criticalDelta = Number(entry.criticalDelta) || 0;
        const criticalBefore = Number(entry.criticalBefore);
        const criticalAfter = Number(entry.criticalAfter);
        const hasCritical = Number.isFinite(criticalAfter) && Number.isFinite(criticalBefore)
            ? criticalAfter > criticalBefore
            : criticalDelta > 0;
        const newCritical = hasCritical
            ? (Number.isFinite(criticalBefore) ? criticalBefore : Math.max(actor.wounds.critical - criticalDelta, 0))
            : actor.wounds.critical;
        actor._suppressWoundsFloat = true;
        try {
            await actor.update({
                "system.wounds.value": newWounds,
                "system.wounds.critical": newCritical
            });
        } finally {
            delete actor._suppressWoundsFloat;
        }
        const afterTotal = (Number(newWounds) || 0) + (Number(newCritical) || 0);
        _showWoundsFloat(actor, afterTotal - beforeTotal);
        entry.reverted = true;
        revertedAny = true;
    }

    if (!revertedAny) {
        ui.notifications.warn("No applied damage to revert.");
        return;
    }

    await message.setFlag("dark-heresy", "appliedDamage", Array.isArray(applied) ? entries : entries[0]);

    const rollData = message.getRollData?.();
    const sourceMessageId = rollData?.sourceMessageId;
    if (sourceMessageId) {
        const sourceMessage = game.messages.get(sourceMessageId);
        if (sourceMessage) {
            const sourceRollData = sourceMessage.getRollData?.();
            if (sourceRollData) {
                delete sourceRollData.hitsRemaining;
                await sourceMessage.setFlag("dark-heresy", "rollData", sourceRollData);
            }
        }
    }

    const idsToMatch = new Set([message.id]);
    if (sourceMessageId) idsToMatch.add(sourceMessageId);
    if (sourceMessageId) {
        const relatedMessages = game.messages.contents.filter(msg => {
            if (msg.id === sourceMessageId) return false; // keep attack card
            const data = msg.getRollData?.();
            const dataSourceId = data?.sourceMessageId;
            const flagSourceId = msg.getFlag("dark-heresy", "sourceMessageId");
            return idsToMatch.has(dataSourceId) || idsToMatch.has(flagSourceId);
        });
        for (const relatedMessage of relatedMessages) {
            await relatedMessage.delete();
        }
    } else {
        await message.delete();
    }
}


/**
 * Pan and zoom to a targeted token from the chat message.
 * @param {Event} event
 */
function onChatTargetClick(event) {
    event.preventDefault();
    const target = $(event.currentTarget);
    const tokenId = target.data("tokenId");
    const sceneId = target.data("sceneId");

    if (!canvas?.ready) return;
    if (sceneId && canvas.scene?.id !== sceneId) {
        ui.notifications.warn(game.i18n.localize("NOTIFICATION.TARGET_DIFFERENT_SCENE") || "Target is in another scene.");
        return;
    }

    const token = canvas.tokens.get(tokenId);
    if (!token) return;

    token.control({releaseOthers: true});
    const currentScale = canvas.stage?.scale?.x || 1;
    canvas.animatePan({x: token.center.x, y: token.center.y, scale: currentScale});
}

class DhMacroUtil {

    static async createMacro(data, slot)
    {
    // Create item macro if rollable item - weapon, spell, prayer, trait, or skill
        let document = await fromUuid(data.uuid);
        let macro;
        if (document.documentName === "Item") {
            let command = `game.macro.rollAttack("${document.name}", "${document.type}");`;
            macro = game.macros.contents.find(m => (m.name === document.name) && (m.command === command));
            if (!macro) {
                macro = await Macro.create({
                    name: document.name,
                    type: "script",
                    img: document.img,
                    command: command
                }, { displaySheet: false });
            }
        }
        else if (document.documentName === "Actor") {
            macro = await Macro.create({
                name: document.name,
                type: "script",
                img: document.img,
                command: `game.actors.get("${document.id}").sheet.render(true)`
            }, { displaySheet: false });
        }
        if (macro) game.user.assignHotbarMacro(macro, slot);
    }

    static rollAttack(itemName, itemType) {
        let actor = this.getActor();

        if (!actor) return ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ACTOR_NOT_FOUND")}`);

        let item = actor.items.find(i => i.name === itemName && i.type === itemType);

        if (!item) return ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ITEM_NOT_FOUND")} ${itemName}`);

        if (item.isPsychicPower) {
            this.rollPsychicPower(actor, item);
        }
        if (item.isWeapon) {
            this.rollWeapon(actor, item);
        }
    }

    static rollTest(name, type, specialty) {
        let actor = this.getActor();

        if (!actor) return ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ACTOR_NOT_FOUND")}`);

        let rollData;

        if (specialty) {
            rollData = DarkHeresyUtil.createSpecialtyRollData(actor, name, specialty);
        } else if (type === "skill") {
            rollData = DarkHeresyUtil.createSkillRollData(actor, name);
        } else if (name === "fear") {
            rollData = DarkHeresyUtil.createFearTestRolldata(actor);
        } else if (name === "malignancy") {
            rollData = DarkHeresyUtil.createMalignancyTestRolldata(actor);
        } else if (name === "trauma") {
            rollData = DarkHeresyUtil.createTraumaTestRolldata(actor);
        } else {
            rollData = DarkHeresyUtil.createCharacteristicRollData(actor, name);
        }
        prepareCommonRoll(rollData);
    }

    static rollPsychicPower(actor, item) {
        let rollData = DarkHeresyUtil.createPsychicRollData(actor, item);
        preparePsychicPowerRoll(rollData);
    }

    static rollWeapon(actor, item) {
        let rollData = DarkHeresyUtil.createWeaponRollData(actor, item);
        prepareCombatRoll(rollData);
    }

    static getActor() {
        const speaker = ChatMessage.getSpeaker();
        let actor;

        if (speaker.token) actor = game.actors.tokens[speaker.token];
        if (!actor) actor = game.actors.get(speaker.actor);

        return actor;
    }
}

let Dh = {};

Dh.attackType = {};

Dh.attackTypeRanged = {
    none: "ATTACK_TYPE.NONE",
    standard: "ATTACK_TYPE.STANDARD",
    semi_auto: "ATTACK_TYPE.SEMI_AUTO",
    full_auto: "ATTACK_TYPE.FULL_AUTO",
    wide_auto: "ATTACK_TYPE.WIDE_AUTO",
    suppression: "ATTACK_TYPE.SUPPRESSION",
    called_shot: "ATTACK_TYPE.CALLED_SHOT"
};

Dh.attackTypeMelee = {
    none: "ATTACK_TYPE.NONE",
    standard: "ATTACK_TYPE.STANDARD",
    charge: "ATTACK_TYPE.CHARGE",
    swift: "ATTACK_TYPE.SWIFT",
    lightning: "ATTACK_TYPE.LIGHTNING",
    allOut: "ATTACK_TYPE.ALLOUT",
    called_shot: "ATTACK_TYPE.CALLED_SHOT"
};

Dh.attackTypePsy = {
    none: "ATTACK_TYPE.NONE",
    bolt: "PSYCHIC_POWER.BOLT",
    barrage: "PSYCHIC_POWER.BARRAGE",
    storm: "PSYCHIC_POWER.STORM",
    blast: "PSYCHIC_POWER.BLAST"
};

Dh.ranges = {
    0: "RANGE.NONE",
    30: "RANGE.POINT_BLANK",
    10: "RANGE.SHORT",
    "-10": "RANGE.LONG",
    "-30": "RANGE.EXTREME"
};

Dh.damageTypes = {
    energy: "DAMAGE_TYPE.ENERGY",
    impact: "DAMAGE_TYPE.IMPACT",
    rending: "DAMAGE_TYPE.RENDING",
    explosive: "DAMAGE_TYPE.EXPLOSIVE"
};


Dh.aimModes = {
    0: "AIMING.NONE",
    10: "AIMING.HALF",
    20: "AIMING.FULL"
};

Dh.difficulties = {
    60: "DIFFICULTY.TRIVIAL",
    50: "DIFFICULTY.ELEMENTARY",
    40: "DIFFICULTY.SIMPLE",
    30: "DIFFICULTY.EASY",
    20: "DIFFICULTY.ROUTINE",
    10: "DIFFICULTY.ORDINARY",
    0: "DIFFICULTY.CHALLENGING",
    "-10": "DIFFICULTY.DIFFICULT",
    "-20": "DIFFICULTY.HARD",
    "-30": "DIFFICULTY.VERY_HARD",
    "-40": "DIFFICULTY.ARDUOUS",
    "-50": "DIFFICULTY.PUNISHING",
    "-60": "DIFFICULTY.HELLISH"
};

Dh.evasions = {
    dodge: "SKILL.DODGE",
    parry: "SKILL.PARRY",
    deny: "DIALOG.DENY_THE_WITCH",
    willpower: "CHARACTERISTIC.WILLPOWER",
    toughness: "CHARACTERISTIC.TOUGHNESS",
    agility: "CHARACTERISTIC.AGILITY",
    strength: "CHARACTERISTIC.STRENGTH"
};

Dh.craftmanship = {
    poor: "CRAFTSMANSHIP.POOR",
    common: "CRAFTSMANSHIP.COMMON",
    good: "CRAFTSMANSHIP.GOOD",
    best: "CRAFTSMANSHIP.BEST"
};

Dh.availability = {
    ubiquitous: "AVAILABILITY.UBIQUITOUS",
    abundant: "AVAILABILITY.ABUNDANT",
    plentiful: "AVAILABILITY.PLENTIFUL",
    common: "AVAILABILITY.COMMON",
    average: "AVAILABILITY.AVERAGE",
    scarce: "AVAILABILITY.SCARCE",
    rare: "AVAILABILITY.RARE",
    "very-rare": "AVAILABILITY.VERY_RARE",
    "extremely-rare": "AVAILABILITY.EXTREMELY_RARE",
    "near-unique": "AVAILABILITY.NEAR_UNIQUE",
    unique: "AVAILABILITY.UNIQUE"
};


Dh.armourTypes = {
    basic: "ARMOUR_TYPE.BASIC",
    flak: "ARMOUR_TYPE.FLAK",
    mesh: "ARMOUR_TYPE.MESH",
    carapace: "ARMOUR_TYPE.CARAPACE",
    power: "ARMOUR_TYPE.POWER"
};

Dh.weaponType = {
    las: "WEAPON.LAS",
    solidprojectile: "WEAPON.SOLIDPROJECTILE",
    bolt: "WEAPON.BOLT",
    melta: "WEAPON.MELTA",
    plasma: "WEAPON.PLASMA",
    flame: "WEAPON.FLAME",
    lowtech: "WEAPON.LOWTECH",
    launcher: "WEAPON.LAUNCHER",
    explosive: "WEAPON.EXPLOSIVE",
    exotic: "WEAPON.EXOTIC",
    chain: "WEAPON.CHAIN",
    power: "WEAPON.POWER",
    shock: "WEAPON.SHOCK",
    force: "WEAPON.FORCE"
};

Dh.weaponClass = {
    melee: "WEAPON.MELEE",
    thrown: "WEAPON.THROWN",
    pistol: "WEAPON.PISTOL",
    basic: "WEAPON.BASIC",
    heavy: "WEAPON.HEAVY",
    launched: "WEAPON.LAUNCHED",
    placed: "WEAPON.PLACED",
    vehicle: "WEAPON.VEHICLE"
};

Dh.psykerClass = {
    bound: "PSYCHIC_POWER.BOUND",
    unbound: "PSYCHIC_POWER.UNBOUND",
    daemonic: "PSYCHIC_POWER.DAEMONIC"
};

Dh.advanceStagesCharacteristics = {
    0: "ADVANCE.NONE",
    5: "ADVANCE.SIMPLE",
    10: "ADVANCE.INTERMEDIATE",
    15: "ADVANCE.TRAINED",
    20: "ADVANCE.PROFICIENT",
    25: "ADVANCE.EXPERT"
};

Dh.advanceStagesSkills = {
    "-20": "ADVANCE.UNTRAINED",
    0: "ADVANCE.KNOWN",
    10: "ADVANCE.TRAINED",
    20: "ADVANCE.EXPERIENCED",
    30: "ADVANCE.VETERAN"
};

Dh.characteristicCosts = [
    [0, 0, 0],
    [100, 250, 500],
    [250, 500, 750],
    [500, 750, 1000],
    [750, 1000, 1500],
    [1250, 1500, 2500]];

Dh.talentCosts = [[200, 300, 600], [300, 450, 900], [400, 600, 1200]];

Dh.hitLocations = {
    head: "ARMOUR.HEAD",
    leftArm: "ARMOUR.LEFT_ARM",
    rightArm: "ARMOUR.RIGHT_ARM",
    body: "ARMOUR.BODY",
    leftLeg: "ARMOUR.LEFT_LEG",
    rightLeg: "ARMOUR.RIGHT_LEG"
};

/**
 * Register all attribute keys for Active Effects in dark-heresy system
 * This allows effects to modify any actor or item attribute
 */
function registerActiveEffectAttributeKeys() {
    const attributeKeys = {};
    
    // ============================================
    // Actor Core Attributes
    // ============================================
    
    // Characteristics - only modifiable attributes (computed ones are removed)
    // total, bonus, displayTotal, displayBonus are computed and cannot be modified directly
    const characteristics = ["weaponSkill", "ballisticSkill", "strength", "toughness", "agility", "intelligence", "perception", "willpower", "fellowship"];
    characteristics.forEach(char => {
        attributeKeys[`system.characteristics.${char}.base`] = { label: `CHARACTERISTIC.${char.toUpperCase()}.BASE`, type: "Number" };
        attributeKeys[`system.characteristics.${char}.advance`] = { label: `CHARACTERISTIC.${char.toUpperCase()}.ADVANCE`, type: "Number" };
        // total, bonus, displayTotal, displayBonus are computed - removed
        attributeKeys[`system.characteristics.${char}.tempModifier`] = { label: `CHARACTERISTIC.${char.toUpperCase()}.TEMP_MODIFIER`, type: "Number" };
        attributeKeys[`system.characteristics.${char}.unnatural`] = { label: `CHARACTERISTIC.${char.toUpperCase()}.UNNATURAL`, type: "Number" };
        attributeKeys[`system.characteristics.${char}.cost`] = { label: `CHARACTERISTIC.${char.toUpperCase()}.COST`, type: "Number" };
    });
    
    // Wounds
    attributeKeys["system.wounds.value"] = { label: "WOUNDS.VALUE", type: "Number" };
    attributeKeys["system.wounds.max"] = { label: "WOUNDS.MAX", type: "Number" };
    attributeKeys["system.wounds.critical"] = { label: "WOUNDS.CRITICAL", type: "Number" };
    attributeKeys["system.wounds.regeneration"] = { label: "WOUNDS.REGENERATION", type: "Number" };
    
    // Fatigue
    attributeKeys["system.fatigue.value"] = { label: "FATIGUE.VALUE", type: "Number" };
    attributeKeys["system.fatigue.max"] = { label: "FATIGUE.MAX", type: "Number" };
    
    // Fate
    attributeKeys["system.fate.value"] = { label: "FATE.VALUE", type: "Number" };
    attributeKeys["system.fate.max"] = { label: "FATE.MAX", type: "Number" };
    
    // Psy
    attributeKeys["system.psy.rating"] = { label: "PSY.RATING", type: "Number" };
    attributeKeys["system.psy.sustained"] = { label: "PSY.SUSTAINED", type: "Number" };
    // currentRating is computed - removed
    attributeKeys["system.psy.cost"] = { label: "PSY.COST", type: "Number" };
    attributeKeys["system.psy.class"] = { label: "PSY.CLASS", type: "String" };
    
    // Insanity & Corruption
    attributeKeys["system.insanity"] = { label: "INSANITY", type: "Number" };
    // insanityBonus is computed - removed
    attributeKeys["system.corruption"] = { label: "CORRUPTION", type: "Number" };
    // corruptionBonus is computed - removed
    
    // Initiative
    attributeKeys["system.initiative.base"] = { label: "INITIATIVE.BASE", type: "Number" };
    // initiative.bonus is computed - removed
    attributeKeys["system.initiative.characteristic"] = { label: "INITIATIVE.CHARACTERISTIC", type: "String" };
    
    // Armour - all locations (only modifiable attributes)
    const armourLocations = ["head", "leftArm", "rightArm", "body", "leftLeg", "rightLeg"];
    armourLocations.forEach(loc => {
        attributeKeys[`system.armour.${loc}.value`] = { label: `ARMOUR.${loc.toUpperCase()}.VALUE`, type: "Number" };
        // total and toughnessBonus are computed - removed
        attributeKeys[`system.armour.${loc}.tempModifier`] = { label: `ARMOUR.${loc.toUpperCase()}.TEMP_MODIFIER`, type: "Number" };
    });
    
    // Movement
    attributeKeys["system.movement.walk"] = { label: "MOVEMENT.WALK", type: "Number" };
    attributeKeys["system.movement.run"] = { label: "MOVEMENT.RUN", type: "Number" };
    attributeKeys["system.movement.charge"] = { label: "MOVEMENT.CHARGE", type: "Number" };
    attributeKeys["system.movement.half"] = { label: "MOVEMENT.HALF", type: "Number" };
    attributeKeys["system.movement.full"] = { label: "MOVEMENT.FULL", type: "Number" };
    attributeKeys["system.movementBonus"] = { label: "MOVEMENT_BONUS", type: "Number" };
    attributeKeys["system.movementBonus.half"] = { label: "MOVEMENT_BONUS.HALF", type: "Number" };
    attributeKeys["system.movementBonus.full"] = { label: "MOVEMENT_BONUS.FULL", type: "Number" };
    attributeKeys["system.movementBonus.charge"] = { label: "MOVEMENT_BONUS.CHARGE", type: "Number" };
    attributeKeys["system.movementBonus.run"] = { label: "MOVEMENT_BONUS.RUN", type: "Number" };
    
    // Encumbrance
    attributeKeys["system.encumbrance.value"] = { label: "ENCUMBRANCE.VALUE", type: "Number" };
    attributeKeys["system.encumbrance.max"] = { label: "ENCUMBRANCE.MAX", type: "Number" };
    
    // Experience (only modifiable attributes)
    attributeKeys["system.experience.value"] = { label: "EXPERIENCE.VALUE", type: "Number" };
    // totalSpent and remaining are computed - removed
    attributeKeys["system.experience.spentCharacteristics"] = { label: "EXPERIENCE.SPENT_CHARACTERISTICS", type: "Number" };
    attributeKeys["system.experience.spentSkills"] = { label: "EXPERIENCE.SPENT_SKILLS", type: "Number" };
    attributeKeys["system.experience.spentTalents"] = { label: "EXPERIENCE.SPENT_TALENTS", type: "Number" };
    attributeKeys["system.experience.spentPsychicPowers"] = { label: "EXPERIENCE.SPENT_PSYCHIC_POWERS", type: "Number" };
    attributeKeys["system.experience.spentOther"] = { label: "EXPERIENCE.SPENT_OTHER", type: "Number" };
    
    // NPC specific
    attributeKeys["system.horde"] = { label: "HORDE", type: "Number" };
    attributeKeys["system.threatLevel"] = { label: "THREAT_LEVEL", type: "Number" };
    attributeKeys["system.size"] = { label: "SIZE", type: "Number" };
    attributeKeys["system.faction"] = { label: "FACTION", type: "String" };
    attributeKeys["system.subfaction"] = { label: "SUBFACTION", type: "String" };
    attributeKeys["system.type"] = { label: "TYPE", type: "String" };
    
    // Bio fields (Character biography)
    attributeKeys["system.bio.homeWorld"] = { label: "BIO.HOMEWORLD", type: "String" };
    attributeKeys["system.bio.role"] = { label: "BIO.ROLE", type: "String" };
    attributeKeys["system.bio.background"] = { label: "BIO.BACKGROUND", type: "String" };
    attributeKeys["system.bio.elite"] = { label: "BIO.ELITE", type: "String" };
    attributeKeys["system.bio.gender"] = { label: "BIO.GENDER", type: "String" };
    attributeKeys["system.bio.age"] = { label: "BIO.AGE", type: "String" };
    attributeKeys["system.bio.build"] = { label: "BIO.BUILD", type: "String" };
    attributeKeys["system.bio.complexion"] = { label: "BIO.COMPLEXION", type: "String" };
    attributeKeys["system.bio.hair"] = { label: "BIO.HAIR", type: "String" };
    attributeKeys["system.bio.divination"] = { label: "BIO.DIVINATION", type: "String" };
    attributeKeys["system.bio.quirks"] = { label: "BIO.QUIRKS", type: "String" };
    attributeKeys["system.bio.superstition"] = { label: "BIO.SUPERSTITION", type: "String" };
    attributeKeys["system.bio.momentos"] = { label: "BIO.MOMENTOS", type: "String" };
    attributeKeys["system.bio.notes"] = { label: "BIO.NOTES", type: "String" };
    
    // Skills - common skills that might be modified (only advance, total is computed)
    const commonSkills = ["acrobatics", "athletics", "awareness", "charm", "command", "commerce", "deceive", "dodge", 
                          "inquiry", "intimidate", "logic", "medicae", "performer", "psyniscience", "scrutiny", 
                          "security", "sleightOfHand", "stealth", "survival", "techUse", "forbiddenLore", "commonLore",
                          "scholasticLore", "trade", "operate"];
    commonSkills.forEach(skill => {
        attributeKeys[`system.skills.${skill}.advance`] = { label: `SKILL.${skill.toUpperCase()}.ADVANCE`, type: "Number" };
        attributeKeys[`system.skills.${skill}.cost`] = { label: `SKILL.${skill.toUpperCase()}.COST`, type: "Number" };
        attributeKeys[`system.skills.${skill}.starter`] = { label: `SKILL.${skill.toUpperCase()}.STARTER`, type: "Boolean" };
        // total is computed - removed
        // Specialities - dynamic, but we can add pattern for common ones
        // Note: Specialities are dynamic, so effects would need to target specific ones
        // Pattern: system.skills.{skill}.specialities.{speciality}.advance
        // Pattern: system.skills.{skill}.specialities.{speciality}.cost
        // Pattern: system.skills.{skill}.specialities.{speciality}.starter
    });
    
    // Note: Skill specialities are dynamic and user-defined, so they cannot be pre-registered.
    // Users can manually add effects targeting specific specialities using the pattern:
    // system.skills.{skillName}.specialities.{specialityName}.advance
    // system.skills.{skillName}.specialities.{specialityName}.cost
    // system.skills.{skillName}.specialities.{specialityName}.starter
    
    // ============================================
    // Item Attributes
    // ============================================
    
    // Weapon attributes
    attributeKeys["system.damage"] = { label: "WEAPON.DAMAGE", type: "String" };
    attributeKeys["system.damageType"] = { label: "WEAPON.DAMAGE_TYPE", type: "String" };
    attributeKeys["system.penetration"] = { label: "WEAPON.PENETRATION", type: "Number" };
    attributeKeys["system.range"] = { label: "WEAPON.RANGE", type: "String" };
    attributeKeys["system.rateOfFire"] = { label: "WEAPON.RATE_OF_FIRE", type: "String" };
    attributeKeys["system.reload"] = { label: "WEAPON.RELOAD", type: "String" };
    attributeKeys["system.class"] = { label: "WEAPON.CLASS", type: "String" };
    attributeKeys["system.type"] = { label: "WEAPON.TYPE", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "WEAPON.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.availability"] = { label: "WEAPON.AVAILABILITY", type: "String" };
    attributeKeys["system.weight"] = { label: "WEAPON.WEIGHT", type: "Number" };
    attributeKeys["system.special"] = { label: "WEAPON.SPECIAL", type: "String" };
    attributeKeys["system.attack"] = { label: "WEAPON.ATTACK", type: "String" };
    
    // Armour item attributes
    attributeKeys["system.locations.head"] = { label: "ARMOUR_ITEM.HEAD", type: "Boolean" };
    attributeKeys["system.locations.leftArm"] = { label: "ARMOUR_ITEM.LEFT_ARM", type: "Boolean" };
    attributeKeys["system.locations.rightArm"] = { label: "ARMOUR_ITEM.RIGHT_ARM", type: "Boolean" };
    attributeKeys["system.locations.body"] = { label: "ARMOUR_ITEM.BODY", type: "Boolean" };
    attributeKeys["system.locations.leftLeg"] = { label: "ARMOUR_ITEM.LEFT_LEG", type: "Boolean" };
    attributeKeys["system.locations.rightLeg"] = { label: "ARMOUR_ITEM.RIGHT_LEG", type: "Boolean" };
    attributeKeys["system.armourValue"] = { label: "ARMOUR_ITEM.VALUE", type: "Number" };
    
    // Psychic Power attributes
    attributeKeys["system.focusPower.test"] = { label: "PSYCHIC_POWER.FOCUS_POWER_TEST", type: "String" };
    attributeKeys["system.focusPower.modifier"] = { label: "PSYCHIC_POWER.FOCUS_POWER_MODIFIER", type: "Number" };
    attributeKeys["system.focusPower.difficulty"] = { label: "PSYCHIC_POWER.FOCUS_POWER_DIFFICULTY", type: "String" };
    attributeKeys["system.range"] = { label: "PSYCHIC_POWER.RANGE", type: "String" };
    attributeKeys["system.sustained"] = { label: "PSYCHIC_POWER.SUSTAINED", type: "Boolean" };
    attributeKeys["system.action"] = { label: "PSYCHIC_POWER.ACTION", type: "String" };
    attributeKeys["system.opposed"] = { label: "PSYCHIC_POWER.OPPOSED", type: "String" };
    attributeKeys["system.overbleed"] = { label: "PSYCHIC_POWER.OVERBLEED", type: "Number" };
    attributeKeys["system.damage"] = { label: "PSYCHIC_POWER.DAMAGE", type: "String" };
    attributeKeys["system.penetration"] = { label: "PSYCHIC_POWER.PENETRATION", type: "Number" };
    attributeKeys["system.subtype"] = { label: "PSYCHIC_POWER.TYPE", type: "String" };
    attributeKeys["system.prerequisite"] = { label: "PSYCHIC_POWER.PREREQUISITE", type: "String" };
    
    // Talent attributes
    attributeKeys["system.tier"] = { label: "TALENT.TIER", type: "Number" };
    attributeKeys["system.aptitudes"] = { label: "TALENT.APTITUDES", type: "String" };
    attributeKeys["system.cost"] = { label: "TALENT.COST", type: "Number" };
    attributeKeys["system.starter"] = { label: "TALENT.STARTER", type: "Boolean" };
    attributeKeys["system.benefit"] = { label: "TALENT.BENEFIT", type: "String" };
    attributeKeys["system.prerequisites"] = { label: "TALENT.PREREQUISITES", type: "String" };
    attributeKeys["system.prerequisite"] = { label: "TALENT.PREREQUISITE", type: "String" };
    
    // Ammunition attributes
    attributeKeys["system.damage"] = { label: "AMMUNITION.DAMAGE", type: "String" };
    attributeKeys["system.penetration"] = { label: "AMMUNITION.PENETRATION", type: "Number" };
    attributeKeys["system.attack"] = { label: "AMMUNITION.ATTACK", type: "String" };
    attributeKeys["system.availability"] = { label: "AMMUNITION.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "AMMUNITION.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.weight"] = { label: "AMMUNITION.WEIGHT", type: "Number" };
    attributeKeys["system.cost"] = { label: "AMMUNITION.COST", type: "Number" };
    
    // Force Field attributes
    attributeKeys["system.rating"] = { label: "FORCE_FIELD.RATING", type: "Number" };
    attributeKeys["system.overload"] = { label: "FORCE_FIELD.OVERLOAD", type: "Number" };
    attributeKeys["system.overloadChance"] = { label: "FORCE_FIELD.OVERLOAD_CHANCE", type: "Number" };
    attributeKeys["system.availability"] = { label: "FORCE_FIELD.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "FORCE_FIELD.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.weight"] = { label: "FORCE_FIELD.WEIGHT", type: "Number" };
    attributeKeys["system.cost"] = { label: "FORCE_FIELD.COST", type: "Number" };
    
    // Cybernetic attributes
    attributeKeys["system.availability"] = { label: "CYBERNETIC.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "CYBERNETIC.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.weight"] = { label: "CYBERNETIC.WEIGHT", type: "Number" };
    attributeKeys["system.cost"] = { label: "CYBERNETIC.COST", type: "Number" };
    attributeKeys["system.effect"] = { label: "CYBERNETIC.EFFECT", type: "String" };
    
    // Drug attributes
    attributeKeys["system.availability"] = { label: "DRUG.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "DRUG.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.weight"] = { label: "DRUG.WEIGHT", type: "Number" };
    attributeKeys["system.cost"] = { label: "DRUG.COST", type: "Number" };
    attributeKeys["system.effect"] = { label: "DRUG.EFFECT", type: "String" };
    
    // Gear attributes
    attributeKeys["system.availability"] = { label: "GEAR.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "GEAR.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.weight"] = { label: "GEAR.WEIGHT", type: "Number" };
    attributeKeys["system.cost"] = { label: "GEAR.COST", type: "Number" };
    attributeKeys["system.effect"] = { label: "GEAR.EFFECT", type: "String" };
    
    // Tool attributes
    attributeKeys["system.availability"] = { label: "TOOL.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "TOOL.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.weight"] = { label: "TOOL.WEIGHT", type: "Number" };
    attributeKeys["system.cost"] = { label: "TOOL.COST", type: "Number" };
    attributeKeys["system.effect"] = { label: "TOOL.EFFECT", type: "String" };
    
    // Weapon Modification attributes
    attributeKeys["system.availability"] = { label: "WEAPON_MODIFICATION.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "WEAPON_MODIFICATION.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.weight"] = { label: "WEAPON_MODIFICATION.WEIGHT", type: "Number" };
    attributeKeys["system.cost"] = { label: "WEAPON_MODIFICATION.COST", type: "Number" };
    attributeKeys["system.effect"] = { label: "WEAPON_MODIFICATION.EFFECT", type: "String" };
    
    // Generic item attributes (common to all items)
    attributeKeys["system.quantity"] = { label: "ITEM.QUANTITY", type: "Number" };
    attributeKeys["system.weight"] = { label: "ITEM.WEIGHT", type: "Number" };
    attributeKeys["system.availability"] = { label: "ITEM.AVAILABILITY", type: "String" };
    attributeKeys["system.craftsmanship"] = { label: "ITEM.CRAFTSMANSHIP", type: "String" };
    attributeKeys["system.cost"] = { label: "ITEM.COST", type: "Number" };
    attributeKeys["system.effect"] = { label: "ITEM.EFFECT", type: "String" };
    attributeKeys["system.upgrades"] = { label: "ITEM.UPGRADES", type: "String" };
    attributeKeys["system.subtype"] = { label: "ITEM.SUBTYPE", type: "String" };
    attributeKeys["system.type"] = { label: "ITEM.TYPE", type: "String" };
    
    // ============================================
    // Module Compatibility (Health Estimate)
    // ============================================
    attributeKeys["system.attributes.hp.value"] = { label: "ATTRIBUTES.HP.VALUE", type: "Number" };
    attributeKeys["system.attributes.hp.max"] = { label: "ATTRIBUTES.HP.MAX", type: "Number" };
    attributeKeys["system.attributes.hp.min"] = { label: "ATTRIBUTES.HP.MIN", type: "Number" };
    
    // Register the attribute keys
    if (CONFIG.ActiveEffect) {
        CONFIG.ActiveEffect.attributeKeys = foundry.utils.mergeObject(
            CONFIG.ActiveEffect.attributeKeys || {},
            attributeKeys
        );
    }
}

CONFIG.statusEffects = [
    {
        id: "bleeding",
        name: "CONDITION.BLEEDING",
        img: "systems/dark-heresy/assets/icons/conditions/bleeding.svg",
        statuses: ["bleeding"]
    },
    {
        id: "blinded",
        name: "CONDITION.BLINDED",
        img: "systems/dark-heresy/assets/icons/conditions/blinded.svg",
        statuses: ["blinded"]
    },
    {
        id: "deafened",
        name: "CONDITION.DEAFEND",
        img: "systems/dark-heresy/assets/icons/conditions/deafened.svg",
        statuses: ["deafened"]
    },
    {
        id: "fear",
        name: "CONDITION.FEAR",
        img: "systems/dark-heresy/assets/icons/conditions/frightened.svg",
        statuses: ["fear"]
    },
    {
        id: "fire",
        name: "CONDITION.FIRE",
        img: "systems/dark-heresy/assets/icons/conditions/ablaze.svg",
        statuses: ["fire"]
    },
    {
        id: "grappled",
        name: "CONDITION.GRAPPLED",
        img: "systems/dark-heresy/assets/icons/conditions/restrained.svg",
        statuses: ["grappled"]
    },
    {
        id: "hidden",
        name: "CONDITION.HIDDEN",
        img: "systems/dark-heresy/assets/icons/conditions/blinded.svg",
        statuses: ["hidden"]
    },
    {
        id: "pinned",
        name: "CONDITION.PINNED",
        img: "systems/dark-heresy/assets/icons/conditions/restrained.svg",
        statuses: ["pinned"]
    },
    {
        id: "poisond",
        name: "CONDITION.POISONED",
        img: "systems/dark-heresy/assets/icons/conditions/poisoned.svg",
        statuses: ["poisond"]
    },
    {
        id: "prone",
        name: "CONDITION.PRONE",
        img: "systems/dark-heresy/assets/icons/conditions/prone.svg",
        statuses: ["prone"]
    },
    {
        id: "stunned",
        name: "CONDITION.STUNNED",
        img: "systems/dark-heresy/assets/icons/conditions/stunned.svg",
        statuses: ["stunned"]
    },
    {
        id: "unconscious",
        name: "CONDITION.UNCONSCIOUS",
        img: "systems/dark-heresy/assets/icons/conditions/unconscious.svg",
        statuses: ["unconscious"]
    },
    {
        id: "dead",
        name: "EFFECT.StatusDead", // Foundry Default Text Key
        img: "systems/dark-heresy/assets/icons/conditions/dead.svg",
        statuses: ["dead"]
    }
];

function updateTokenHordeLabel(token) {
    if (!token?.actor) return;
    const actor = token.actor;
    if (actor.type !== "npc") {
        if (token.hordeLabel) {
            token.hordeLabel.destroy();
            token.hordeLabel = null;
        }
        return;
    }

    const hordeValue = Number(actor.system?.horde);
    const shouldShow = Number.isFinite(hordeValue) && hordeValue > 0;
    if (!shouldShow) {
        if (token.hordeLabel) token.hordeLabel.visible = false;
        return;
    }

    const labelText = `${hordeValue}`;
    if (!token.hordeLabel) {
        const style = new PIXI.TextStyle({
            fontFamily: "Signika",
            fontSize: 18,
            fill: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        });
        token.hordeLabel = new PIXI.Text(labelText, style);
        token.hordeLabel.anchor.set(0.5, 1);
        token.addChild(token.hordeLabel);
    } else {
        token.hordeLabel.text = labelText;
        token.hordeLabel.visible = true;
    }

    token.hordeLabel.position.set(token.w / 2, -2);
}

Hooks.once("init", async function() {
    // Load template.json for accessing skill specialities
    let templateData = {};
    try {
        const response = await fetch("systems/dark-heresy/template.json");
        templateData = await response.json();
    } catch (e) {
        console.warn("Dark Heresy: Could not load template.json", e);
    }
    
    CONFIG.Combat.initiative = { formula: "@initiative.base + @initiative.bonus", decimals: 0 };
    CONFIG.Actor.documentClass = DarkHeresyActor;
    CONFIG.Item.documentClass = DarkHeresyItem;
    
    // Register default icons for actors
    CONFIG.Actor.defaultIcons = CONFIG.Actor.defaultIcons || {};
    CONFIG.Actor.defaultIcons.acolyte = "systems/dark-heresy/assets/actors/unknown.webp";
    CONFIG.Actor.defaultIcons.npc = "systems/dark-heresy/assets/actors/unknown.webp";
    
    // Configure token attribute bars
    CONFIG.Token.attributeBars = {
        wounds: {
            attribute: "system.wounds",
            label: "WOUNDS",
            max: "max",
            value: "value"
        },
        fate: {
            attribute: "system.fate",
            label: "FATE",
            max: "max",
            value: "value"
        }
    };
    
    // Register default icons for items
    CONFIG.Item.defaultIcons = CONFIG.Item.defaultIcons || {};
    CONFIG.Item.defaultIcons.weapon = "systems/dark-heresy/assets/icons/weapons/melee-weapon.webp";
    CONFIG.Item.defaultIcons.ammunition = "systems/dark-heresy/assets/icons/ammo/ammo.webp";
    CONFIG.Item.defaultIcons.weaponModification = "systems/dark-heresy/assets/icons/modification/modification.webp";
    CONFIG.Item.defaultIcons.armour = "systems/dark-heresy/assets/icons/protection/armour.webp";
    CONFIG.Item.defaultIcons.forceField = "systems/dark-heresy/assets/icons/protection/field.webp";
    CONFIG.Item.defaultIcons.cybernetic = "systems/dark-heresy/assets/icons/augmetics/augmetic.webp";
    CONFIG.Item.defaultIcons.drug = "systems/dark-heresy/assets/icons/equipment/inhaler.webp";
    CONFIG.Item.defaultIcons.gear = "systems/dark-heresy/assets/icons/equipment/equipment.webp";
    CONFIG.Item.defaultIcons.tool = "systems/dark-heresy/assets/icons/equipment/combi-tool.webp";
    CONFIG.Item.defaultIcons.criticalInjury = "systems/dark-heresy/assets/icons/criticals/body.webp";
    CONFIG.Item.defaultIcons.malignancy = "systems/dark-heresy/assets/icons/corruption/corruption.webp";
    CONFIG.Item.defaultIcons.mentalDisorder = "systems/dark-heresy/assets/icons/corruption/corruption.webp";
    CONFIG.Item.defaultIcons.mutation = "systems/dark-heresy/assets/icons/corruption/corruption.webp";
    CONFIG.Item.defaultIcons.psychicPower = "systems/dark-heresy/assets/icons/powers/minor-power.webp";
    CONFIG.Item.defaultIcons.talent = "systems/dark-heresy/assets/icons/generic.webp";
    CONFIG.Item.defaultIcons.specialAbility = "systems/dark-heresy/assets/icons/generic.webp";
    CONFIG.Item.defaultIcons.trait = "systems/dark-heresy/assets/icons/generic.webp";
    CONFIG.Item.defaultIcons.aptitude = "systems/dark-heresy/asset/icons/aptitudes/aptitude400.png";
    CONFIG.Item.defaultIcons.race = "systems/dark-heresy/assets/icons/generic.webp";
    
    // Register item types from template.json
    if (templateData?.Item?.types) {
        CONFIG.Item.typeLabels = {};
        templateData.Item.types.forEach(type => {
            const key = `TYPES.Item.${type.toLowerCase()}`;
            CONFIG.Item.typeLabels[type] = game.i18n.localize(key) || type;
        });
    }
    
    CONFIG.fontDefinitions["Caslon Antique"] = {editor: true, fonts: []};
    
    // Register Active Effect attribute keys for dark-heresy system
    registerActiveEffectAttributeKeys();
    game.darkHeresy = {
        config: Dh,
        templateData: templateData,
        testInit: {
            prepareCommonRoll,
            prepareCombatRoll,
            preparePsychicPowerRoll
        },
        tests: {
            commonRoll,
            combatRoll
        }
    };
    game.macro = DhMacroUtil;
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("dark-heresy", AcolyteSheet, { types: ["acolyte"], makeDefault: true });
    Actors.registerSheet("dark-heresy", NpcSheet, { types: ["npc"], makeDefault: true });
    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("dark-heresy", WeaponSheet, { types: ["weapon"], makeDefault: true });
    Items.registerSheet("dark-heresy", AmmunitionSheet, { types: ["ammunition"], makeDefault: true });
    Items.registerSheet("dark-heresy", WeaponModificationSheet, { types: ["weaponModification"], makeDefault: true });
    Items.registerSheet("dark-heresy", ArmourSheet, { types: ["armour"], makeDefault: true });
    Items.registerSheet("dark-heresy", ForceFieldSheet, { types: ["forceField"], makeDefault: true });
    Items.registerSheet("dark-heresy", CyberneticSheet, { types: ["cybernetic"], makeDefault: true });
    Items.registerSheet("dark-heresy", DrugSheet, { types: ["drug"], makeDefault: true });
    Items.registerSheet("dark-heresy", GearSheet, { types: ["gear"], makeDefault: true });
    Items.registerSheet("dark-heresy", ToolSheet, { types: ["tool"], makeDefault: true });
    Items.registerSheet("dark-heresy", CriticalInjurySheet, { types: ["criticalInjury"], makeDefault: true });
    Items.registerSheet("dark-heresy", MalignancySheet, { types: ["malignancy"], makeDefault: true });
    Items.registerSheet("dark-heresy", MentalDisorderSheet, { types: ["mentalDisorder"], makeDefault: true });
    Items.registerSheet("dark-heresy", MutationSheet, { types: ["mutation"], makeDefault: true });
    Items.registerSheet("dark-heresy", PsychicPowerSheet, { types: ["psychicPower"], makeDefault: true });
    Items.registerSheet("dark-heresy", TalentSheet, { types: ["talent"], makeDefault: true });
    Items.registerSheet("dark-heresy", SpecialAbilitySheet, { types: ["specialAbility"], makeDefault: true });
    Items.registerSheet("dark-heresy", TraitSheet, { types: ["trait"], makeDefault: true });
    Items.registerSheet("dark-heresy", AptitudeSheet, { types: ["aptitude"], makeDefault: true });
    Items.registerSheet("dark-heresy", RaceSheet, { types: ["race"], makeDefault: true });

    initializeHandlebars();

    game.settings.register("dark-heresy", "worldSchemaVersion", {
        name: "World Version",
        hint: "Used to automatically upgrade worlds data when the system is upgraded.",
        scope: "world",
        config: true,
        default: 0,
        type: Number
    });
    game.settings.register("dark-heresy", "autoCalcXPCosts", {
        name: "Calculate XP Costs",
        hint: "If enabled, calculate XP costs automatically.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });
    game.settings.register("dark-heresy", "useSpraytemplate", {
        name: "Use Template with Spray Weapons",
        hint: "If enabled, Spray Weapons will require the user to put down a template before the roll is made. Templates are NOT removed automatically",
        scope: "client",
        config: true,
        default: true,
        type: Boolean
    });

});

Hooks.once("ready", async function() {
    migrateWorld();
    
    game.socket.on("system.dark-heresy", data => {
        if (data?.type === "autoDamage") {
            applyAutoDamageFromSocket(data.payload);
        }
    });
    CONFIG.ChatMessage.documentClass.prototype.getRollData = function() {
        return this.getFlag("dark-heresy", "rollData");
    };

    // Lightning Reflexes: roll initiative twice and keep the better result
    if (!Combat.prototype._dhLightningReflexes) {
        Combat.prototype._dhLightningReflexes = true;
        const originalRollInitiative = Combat.prototype.rollInitiative;
        Combat.prototype.rollInitiative = async function(ids, options = {}) {
            const combatantsToRoll = ids
                ? ids.map(id => this.combatants.get(id)).filter(c => c)
                : Array.from(this.combatants.values());

            const withLightningReflexes = [];
            const withoutLightningReflexes = [];

            for (const combatant of combatantsToRoll) {
                const actor = combatant?.actor;
                if (actor?.getFlag("dark-heresy", "lightningReflexes")) {
                    withLightningReflexes.push(combatant);
                } else {
                    withoutLightningReflexes.push(combatant);
                }
            }

            for (const combatant of withLightningReflexes) {
                const actor = combatant.actor;
                const formula = CONFIG.Combat.initiative.formula;
                const rollData = actor.getRollData();

                const roll1 = new Roll(formula, rollData);
                const roll2 = new Roll(formula, rollData);

                await roll1.evaluate({async: true});
                await roll2.evaluate({async: true});

                const betterResult = Math.max(roll1.total, roll2.total);
                const rollMode = options?.messageOptions?.rollMode
                    || game.settings.get("core", "rollMode");
                if (options?.messageOptions?.create !== false) {
                    const roll1Html = await roll1.render();
                    const roll2Html = await roll2.render();
                    const content = `
                        <div class="dh-lightning-reflexes">
                            <div><strong>Lightning Reflexes</strong></div>
                            ${roll1Html}
                            ${roll2Html}
                            <div class="dice-total">Best: ${betterResult}</div>
                        </div>
                    `;
                    const chatData = {
                        speaker: ChatMessage.getSpeaker({actor}),
                        flavor: `${actor.name} - Lightning Reflexes`,
                        content,
                        rolls: [roll1, roll2]
                    };
                    ChatMessage.applyRollMode(chatData, rollMode);
                    await ChatMessage.create(chatData);
                }
                await combatant.update({initiative: betterResult});
            }

            if (withoutLightningReflexes.length > 0) {
                const idsWithoutLR = withoutLightningReflexes.map(c => c.id);
                return originalRollInitiative.call(this, idsWithoutLR, options);
            }

            return this;
        };
    }

    // Override TokenDocument.toggleStatusEffect to use actor's addCondition/removeCondition
    // This ensures token status clicks use the same logic as sheet condition clicks
    if (!TokenDocument.prototype._dhToggleStatusEffect) {
        TokenDocument.prototype._dhToggleStatusEffect = true;
        const originalToggleStatusEffect = TokenDocument.prototype.toggleStatusEffect;
        TokenDocument.prototype.toggleStatusEffect = async function(statusId, { overlay = false, active = null } = {}) {
            // Get the actor
            const actor = this.actor;
            if (!actor || !(actor instanceof DarkHeresyActor)) {
                // Fallback to original behavior if no actor or not DarkHeresyActor
                return originalToggleStatusEffect.call(this, statusId, { overlay, active });
            }
            
            // Check if status is in CONFIG.statusEffects (is a condition)
            const statusEffect = CONFIG.statusEffects.find(s => s.id === statusId);
            if (!statusEffect) {
                // Not a condition, use original behavior
                return originalToggleStatusEffect.call(this, statusId, { overlay, active });
            }
            
            // Determine if we're adding or removing
            const currentStatuses = this.statuses || new Set();
            const isCurrentlyActive = currentStatuses.has(statusId);
            const shouldBeActive = active !== null ? active : !isCurrentlyActive;
            
            // Use actor's methods (same as sheet)
            if (shouldBeActive && !isCurrentlyActive) {
                // Add condition
                await actor.addCondition(statusId, { type: "minor" });
            } else if (!shouldBeActive && isCurrentlyActive) {
                // Remove condition
                await actor.removeCondition(statusId);
            }
            
            // The actor methods will automatically sync to token via transfer: true
            // So we don't need to manually update token statuses
            
            return this;
        };
    }

    // Skip dead combatants in initiative
    if (!Combat.prototype._dhSkipDead) {
        Combat.prototype._dhSkipDead = true;
        const originalNextTurn = Combat.prototype.nextTurn;
        Combat.prototype.nextTurn = async function() {
            const currentTurn = this.turn;
            const maxTurn = this.turns.length - 1;
            
            // Find next alive combatant
            let nextTurn = currentTurn;
            let attempts = 0;
            const maxAttempts = this.turns.length * 2; // Prevent infinite loop
            
            do {
                nextTurn = (nextTurn + 1) % this.turns.length;
                attempts++;
                
                if (attempts > maxAttempts) {
                    // Fallback to original behavior if all are dead
                    return originalNextTurn.call(this);
                }
                
                const combatant = this.turns[nextTurn];
                if (!combatant) continue;
                
                const actor = combatant.actor;
                if (!actor) continue;
                
                const tokens = actor.getActiveTokens(true);
                if (!tokens.length) continue;
                
                const token = tokens[0];
                
                // Skip if dead
                if (_hasCondition(token, "dead")) {
                    continue;
                }
                
                // Found alive combatant
                break;
            } while (true);
            
            // Update turn - THIS IS WHEN THE TURN CHANGES TO THE NEW ACTOR
            await this.update({ turn: nextTurn });
            
            // NOW the turn has switched to the new actor - apply effects at the START of their turn
            // This happens IMMEDIATELY when initiative switches to them
            const newTurnCombatant = this.combatants.get(this.turns[nextTurn]?.id);
            if (newTurnCombatant) {
                const actor = newTurnCombatant.actor;
                if (actor && (actor.hasPlayerOwner || game.user.isGM)) {
                    // Check if actor is dead - don't apply effects to dead actors
                    const deadCondition = actor.hasCondition("dead");
                    if (!deadCondition) {
                        const token = newTurnCombatant?.token;
                        let hasFireOnToken = false;
                        let hasBleedingOnToken = false;
                        if (token && token.document) {
                            const tokenStatuses = token.document.statuses;
                            if (tokenStatuses instanceof Set) {
                                hasFireOnToken = tokenStatuses.has("fire");
                                hasBleedingOnToken = tokenStatuses.has("bleeding");
                            }
                        }
                        
                        // Check for fire condition
                            const fireCondition = actor.hasCondition("fire");
                            if (fireCondition || hasFireOnToken) {
                                // Apply effect asynchronously (don't block turn change)
                                _applyFireEffect(actor, newTurnCombatant).catch(err => {
                                    console.error(`Error applying fire effect:`, err);
                                });
                            }
                        
                        // Check for bleeding condition
                            const bleedingCondition = actor.hasCondition("bleeding");
                            if (bleedingCondition || hasBleedingOnToken) {
                                // Apply effect asynchronously (don't block turn change)
                                _applyBleedingEffect(actor, newTurnCombatant).catch(err => {
                                    console.error(`Error applying bleeding effect:`, err);
                                });
                            }
                    }
                }
            }
            
            return this;
        };
    }
});


/* -------------------------------------------- */
/*  Other Hooks                                 */
/* -------------------------------------------- */

Hooks.on("refreshToken", (token) => {
    updateTokenHordeLabel(token);
});

Hooks.on("updateActor", async (actor, changes) => {
    if (actor?.type === "npc") {
    const tokens = actor.getActiveTokens(true);
    for (const token of tokens) {
        updateTokenHordeLabel(token);
    }
    }
});


/**
 * Check if a token/actor has a specific condition
 * @param {Token|Actor} tokenOrActor
 * @param {string} conditionId
 * @returns {boolean}
 */
function _hasCondition(tokenOrActor, conditionId) {
    if (!tokenOrActor) {
        return false;
    }
    
    const condition = CONFIG.statusEffects.find(e => e.id === conditionId);
    if (!condition) {
        return false;
    }
    
    // Get the actor (from token or directly)
    const actor = tokenOrActor.actor || tokenOrActor;
    if (!actor) {
        return false;
    }
    
    // PRIMARY CHECK: Check token statuses first (most reliable - statuses are synced via transfer: true)
    if (tokenOrActor.document) {
        const token = tokenOrActor;
        const statuses = token.document.statuses;
        
        if (statuses instanceof Set) {
            if (statuses.has(conditionId)) {
                return true;
            }
        } else if (statuses) {
            // Try to check as object/Map
            if (statuses[conditionId] !== undefined || (statuses instanceof Map && statuses.has(conditionId))) {
                return true;
            }
        }
    }
    
    // SECONDARY CHECK: Check actor effects by statuses array (like impmal)
    if (actor.effects) {
        const effectsArray = Array.from(actor.effects);
        
        // Check if effect has statuses array containing the conditionId (like impmal)
        const effectsWithStatuses = effectsArray.filter(e => {
            // Try multiple ways to access statuses array
            let effectStatuses = e.statuses || e.toObject?.()?.statuses || e.system?.statuses;
            if (effectStatuses && Array.isArray(effectStatuses)) {
                return effectStatuses.includes(conditionId);
            }
            return false;
        });
        if (effectsWithStatuses.length > 0) {
            return true;
        }
        
        // Fallback: check by statusId for backwards compatibility
        const effectsByStatusId = effectsArray.filter(e => e.statusId === conditionId);
        if (effectsByStatusId.length > 0) {
            return true;
        }
    }
    
    // FALLBACK: check actor effects by img (for backwards compatibility)
    if (actor.effects) {
        const effectsArray = Array.from(actor.effects);
        const effectsByImg = effectsArray.filter(e => e.img === condition.img);
        
        if (effectsByImg.length > 0) {
            return true;
        }
    }
    
    return false;
}

/**
 * Get condition modifier for attacks (Stunned gives +20)
 * @param {Object} rollData
 * @returns {number}
 */
function _getTargetConditionModifier(rollData) {
    if (!rollData?.flags?.isAttack || !rollData?.targets?.length) return 0;
    
    const target = rollData.targets[0];
    if (!target || !canvas?.ready) return 0;
    if (target.sceneId && canvas.scene?.id !== target.sceneId) return 0;
    
    const token = canvas.tokens.get(target.tokenId);
    if (!token) return 0;
    
    // Stunned gives +20 to all attacks (melee and ranged)
    if (_hasCondition(token, "stunned")) {
        return 20;
    }
    
    return 0;
}

/**
 * Get target size modifier for ranged attacks
 * @param {object} rollData
 * @returns {number}
 */
function _getTargetSizeModifier(rollData) {
    // Only apply to ranged attacks
    if (!rollData?.flags?.isAttack || !rollData?.weapon?.isRange) return 0;
    
    // Get target
    if (!rollData?.targets?.length) return 0;
    const target = rollData.targets[0];
    if (!target || !canvas?.ready) return 0;
    if (target.sceneId && canvas.scene?.id !== target.sceneId) return 0;
    
    const token = canvas.tokens.get(target.tokenId);
    if (!token || !token.actor) return 0;
    
    // Check if target has Space Marine flag - if so, ignore size modifier
    if (token.actor.getFlag("dark-heresy", "spaceMarine")) {
        return 0;
    }
    
    const targetSize = Number(token.actor.system?.size) || 4; // Default size is 4 (modifier 0)
    
    // Size modifier mapping:
    // 1: -30, 2: -20, 3: -10, 4: 0, 5: +10, 6: +20, 7: +30, 8: +40, 9: +50, 10: +60
    const sizeModifiers = {
        1: -30,
        2: -20,
        3: -10,
        4: 0,
        5: 10,
        6: 20,
        7: 30,
        8: 40,
        9: 50,
        10: 60
    };
    
    return sizeModifiers[targetSize] || 0;
}

/**
 * Get condition modifier for all rolls
 * @param {Actor} actor
 * @param {object} rollData - Optional: roll data to check attack type
 * @returns {number}
 */
function _getActorConditionModifier(actor, rollData = null) {
    if (!actor) return 0;
    
    const tokens = actor.getActiveTokens(true);
    if (!tokens.length) return 0;
    
    const token = tokens[0];
    let modifier = 0;
    
    // Fear gives -10 to everything
    if (_hasCondition(token, "fear")) {
        modifier -= 10;
    }
    
    // Blinded gives -30 to melee attacks
    if (_hasCondition(token, "blinded")) {
        // Check if this is a melee attack
        const isMelee = rollData?.weapon?.weaponClass === "melee" || rollData?.weapon?.class === "melee";
        if (isMelee) {
            modifier -= 30;
        }
    }
    
    return modifier;
}


/** Add Event Listeners for Buttons on chat boxes */
Hooks.once("renderChatLog", (chat, html) => {
    chatListeners(html);
});


/** Add Options to context Menu of chatmessages */
Hooks.on("getChatLogEntryContext", addChatMessageContextOptions);

/**
 * Create a macro when dropping an entity on the hotbar
 * Item      - open roll dialog for item
 */
Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type === "Item" || data.type === "Actor")
    {
        DhMacroUtil.createMacro(data, slot);
        return false;
    }
});

Hooks.on("renderDarkHeresySheet", (sheet, html, data) => {
    html.find("input.cost").prop("disabled", game.settings.get("dark-heresy", "autoCalcXPCosts"));
    // item-cost fields for talents and psychic powers are always disabled (read-only)
    // Cost is edited in item sheet settings, not in progression tab
    html.find("input.item-cost").prop("disabled", true);
});

/**
 * Register Health Estimate provider for Dark Heresy system
 * This allows Health Estimate module to properly calculate health fractions
 */
// Hook to update actor sheets when effects are updated (for conditions synchronization)
Hooks.on("updateActiveEffect", (effect, updateData, options, userId) => {
    // Update all open sheets for this actor
    if (effect.parent && effect.parent.sheet?.rendered) {
        effect.parent.sheet.render(false);
    }
});

Hooks.on("createActiveEffect", (effect, options, userId) => {
    // Update all open sheets for this actor
    if (effect.parent && effect.parent.sheet?.rendered) {
        effect.parent.sheet.render(false);
    }
});

Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    // Update all open sheets for this actor
    if (effect.parent && effect.parent.sheet?.rendered) {
        effect.parent.sheet.render(false);
    }
});

// Fire effect is now handled in Combat.prototype.nextTurn override above
// This ensures it fires at the START of the player's turn, BEFORE the turn ends

/**
 * Apply On Fire effect: damage, fatigue, and willpower test
 */
async function _applyFireEffect(actor, combatant) {
    // Roll 1d10 damage (energy, ignores armor, to Body)
    const damageRoll = new Roll("1d10");
    await damageRoll.evaluate({ async: true });
    const damageAmount = damageRoll.total;
    
    // Apply 1 level of Fatigue
    const currentFatigue = Number(actor.fatigue.value) || 0;
    const maxFatigue = Number(actor.fatigue.max) || 0;
    const newFatigue = Math.min(currentFatigue + 1, maxFatigue);
    await actor.update({ "system.fatigue.value": newFatigue });
    
    // Create Willpower test roll data (серьёзная проверка, +0)
    const willpowerRollData = DarkHeresyUtil.createCharacteristicRollData(actor, "willpower");
    willpowerRollData.name = "CONDITION.FIRE_WILLPOWER_TEST";
    willpowerRollData.flags = willpowerRollData.flags || {};
    willpowerRollData.flags.isFireEffect = true;
    willpowerRollData.difficulty = { value: 0, text: game.i18n.localize("DIFFICULTY.CHALLENGING") }; // Серьёзная проверка = Challenging (+0)
    
    // Roll willpower test immediately (no dialog)
    await _computeCommonTarget(willpowerRollData);
    await _rollTarget(willpowerRollData);
    // _rollTarget already computes the result (isSuccess, dos, dof)
    
    // Apply damage directly to wounds (energy, ignores armor, to Body)
    // Fire damage bypasses armor completely
    const currentWounds = Number(actor.wounds.value) || 0;
    const maxWounds = Number(actor.wounds.max) || 0;
    const currentCritical = Number(actor.wounds.critical) || 0;
    
    let newWounds = currentWounds;
    let newCritical = currentCritical;
    
    if (currentWounds >= maxWounds) {
        // All damage goes to critical wounds
        newCritical += damageAmount;
    } else if (currentWounds + damageAmount > maxWounds) {
        // Some damage to wounds, rest to critical
        const woundsToAdd = maxWounds - currentWounds;
        newWounds = maxWounds;
        newCritical += (damageAmount - woundsToAdd);
    } else {
        newWounds += damageAmount;
    }
    
    await actor.update({
        "system.wounds.value": newWounds,
        "system.wounds.critical": newCritical
    });
    
    // Create and send chat message with all results
    const templateData = {
        actorName: actor.name,
        actorId: actor.id,
        tokenId: combatant?.token?.id,
        damageAmount: damageAmount,
        fatigueApplied: 1,
        newFatigue: newFatigue,
        maxFatigue: maxFatigue,
        // Willpower test results
        name: willpowerRollData.name,
        result: willpowerRollData.result,
        target: willpowerRollData.target,
        flags: willpowerRollData.flags,
        dos: willpowerRollData.dos,
        dof: willpowerRollData.dof,
        difficulty: willpowerRollData.difficulty,
        rolledWith: willpowerRollData.rolledWith || game.i18n.localize("CHARACTERISTIC.WILLPOWER"),
        ownerId: actor.id
    };
    
    const html = await renderTemplate("systems/dark-heresy/template/chat/fire-effect.hbs", templateData);
    
    await ChatMessage.create({
        content: html,
        speaker: ChatMessage.getSpeaker({ actor: actor, token: combatant?.token }),
        flags: {
            "dark-heresy": {
                type: "fire-effect",
                actorId: actor.id
            }
        }
    });
}

/**
 * Apply Bleeding effect: death chance roll
 */
async function _applyBleedingEffect(actor, combatant) {
    // Roll d100 for death chance (10% chance = 90 or higher)
    const deathRoll = new Roll("1d100");
    await deathRoll.evaluate({ async: true });
    const rollResult = deathRoll.total;
    const isDead = rollResult >= 90;
    
    // If death roll succeeded, add "dead" condition
    if (isDead) {
        await actor.addCondition("dead", { type: "minor" });
    }
    
    // Create and send chat message with result
    const templateData = {
        actorName: actor.name,
        actorId: actor.id,
        tokenId: combatant?.token?.id,
        rollResult: rollResult,
        isDead: isDead,
        ownerId: actor.id
    };
    
    const html = await renderTemplate("systems/dark-heresy/template/chat/bleeding-effect.hbs", templateData);
    
    await ChatMessage.create({
        content: html,
        speaker: ChatMessage.getSpeaker({ actor: actor, token: combatant?.token }),
        flags: {
            "dark-heresy": {
                type: "bleeding-effect",
                actorId: actor.id
            }
        }
    });
}

/**
 * Handle click on Willpower test button in fire effect card
 */
async function onFireWillpowerTestClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const button = $(event.currentTarget);
    const actorId = button.data("actor-id");
    if (!actorId) return;
    
    const actor = game.actors.get(actorId);
    if (!actor) return;
    
    const willpowerRollData = DarkHeresyUtil.createCharacteristicRollData(actor, "willpower");
    willpowerRollData.name = "CONDITION.FIRE_WILLPOWER_TEST";
    willpowerRollData.flags = willpowerRollData.flags || {};
    willpowerRollData.flags.isFireEffect = true;
    willpowerRollData.difficulty = { value: 0, text: game.i18n.localize("DIFFICULTY.CHALLENGING") };
    
    await prepareCommonRoll(willpowerRollData);
}

/**
 * Register chat message click handlers
 */
Hooks.on("renderChatMessage", (message, html, data) => {
    // Handle fire effect willpower test button
    html.find(".roll-willpower-test").off("click").on("click", onFireWillpowerTestClick);
});

Hooks.once("ready", function() {
    if (!game.modules.get("healthEstimate")?.active) return;
    if (game.system.id !== "dark-heresy") return;
    
    // Wait a bit for Health Estimate to fully initialize
    setTimeout(() => {
        try {
            // Create Dark Heresy Estimation Provider
            class DarkHeresyEstimationProvider {
                constructor() {
                    this.organicTypes = ["acolyte", "npc"];
                }
                
                /**
                 * Calculates health fraction for Dark Heresy system
                 * In Dark Heresy: 0 wounds = full health, max wounds = dead
                 * So fraction = (maxWounds - currentWounds) / maxWounds
                 */
                fraction(token) {
                    try {
                        const wounds = token.actor?.system?.wounds;
                        if (!wounds) return 0;
                        
                        const maxWounds = Number(wounds.max) || 0;
                        const currentWounds = Number(wounds.value) || 0;
                        
                        if (maxWounds <= 0) return 0;
                        
                        // Calculate remaining health as fraction
                        const remainingHealth = Math.max(0, maxWounds - currentWounds);
                        return Math.min(remainingHealth / maxWounds, 1);
                    } catch (err) {
                        console.error("Dark Heresy Health Estimate: Error calculating fraction", err);
                        return 0;
                    }
                }
            }
            
            // Override Health Estimate's estimationProvider to use our provider
            if (game.healthEstimate) {
                const darkHeresyProvider = new DarkHeresyEstimationProvider();
                
                // Override the estimationProvider property if it exists
                if (game.healthEstimate.estimationProvider) {
                    const originalProvider = game.healthEstimate.estimationProvider;
                    
                    // Create a proxy that intercepts fraction calls
                    const proxyProvider = new Proxy(originalProvider, {
                        get: function(target, prop) {
                            if (prop === 'fraction' && game.system.id === "dark-heresy") {
                                return function(token) {
                                    // Ensure attributes.hp exists for Health Estimate's internal checks
                                    if (token?.actor) {
                                        const actor = token.actor;
                                        if (actor.system && !actor.system.attributes) {
                                            actor.system.attributes = {};
                                        }
                                        if (actor.system?.attributes && !actor.system.attributes.hp) {
                                            const wounds = actor.system?.wounds || {};
                                            const maxWounds = Number(wounds.max) || 0;
                                            const currentWounds = Number(wounds.value) || 0;
                                            actor.system.attributes.hp = {
                                                value: currentWounds,
                                                max: maxWounds,
                                                min: 0
                                            };
                                        }
                                    }
                                    return darkHeresyProvider.fraction(token);
                                };
                            }
                            return target[prop];
                        }
                    });
                    
                    game.healthEstimate.estimationProvider = proxyProvider;
                }
                
                // Also override getFraction as fallback
                if (game.healthEstimate.getFraction) {
                    const originalGetFraction = game.healthEstimate.getFraction;
                    
                    game.healthEstimate.getFraction = function(token) {
                        // Use our provider for Dark Heresy system
                        if (game.system.id === "dark-heresy" && token?.actor) {
                            // Ensure attributes.hp exists for Health Estimate's internal checks
                            const actor = token.actor;
                            if (actor.system && !actor.system.attributes) {
                                actor.system.attributes = {};
                            }
                            if (actor.system?.attributes && !actor.system.attributes.hp) {
                                const wounds = actor.system?.wounds || {};
                                const maxWounds = Number(wounds.max) || 0;
                                const currentWounds = Number(wounds.value) || 0;
                                actor.system.attributes.hp = {
                                    value: currentWounds,
                                    max: maxWounds,
                                    min: 0
                                };
                            }
                            return darkHeresyProvider.fraction(token);
                        }
                        // Fall back to original for other systems
                        return originalGetFraction.call(this, token);
                    };
                }
            }
        } catch (err) {
            console.error("Dark Heresy: Failed to register Health Estimate provider", err);
        }
    }, 100);
});



