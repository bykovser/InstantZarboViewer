// Import Three.js modules for export functionality
import * as THREE from 'https://esm.sh/three@0.160.0';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { USDZExporter } from 'https://esm.sh/three@0.160.0/examples/jsm/exporters/USDZExporter.js';

// Track currently selected item
let selectedItem = null;
let selectedItemType = null; // 'object' or 'material'
let currentNodeIndex = null; // Track current node index for property updates
let selectedThreeMaterial = null; // Store the currently selected Three.js material

// Material editor variables
let selectedMaterialIndex = -1;
let selectedMaterial = null;
let materialPicker = null;

// Update material properties in editorUI
window.updateMaterialEditorUI = function() {
    if (!selectedThreeMaterial) {
        console.log('No selectedThreeMaterial, skipping update');
        return;
    }

    console.log('Updating Material Properties UI for material:', selectedThreeMaterial.name || 'unnamed');

    // Get all input elements - ensure they exist before using
    const baseColorInput = document.getElementById('material-basecolor');
    const metallicInput = document.getElementById('material-metallic');
    const roughnessInput = document.getElementById('material-roughness');
    const emissiveColorInput = document.getElementById('material-emissivecolor');
    const emissiveIntensityInput = document.getElementById('material-emissiveintensity');
    const occlusionStrengthInput = document.getElementById('material-occlusionstrength');
    const alphaInput = document.getElementById('material-alpha');
    const transparentCheckbox = document.getElementById('material-transparent');
    const specularColorInput = document.getElementById('material-specularcolor');
    const specularFactorInput = document.getElementById('material-specularfactor');
    const clearcoatFactorInput = document.getElementById('material-clearcoatfactor');
    const clearcoatRoughnessInput = document.getElementById('material-clearcoatroughness');
    const sheenColorInput = document.getElementById('material-sheencolor');
    const sheenRoughnessInput = document.getElementById('material-sheenroughness');
    const transmissionFactorInput = document.getElementById('material-transmissionfactor');
    const volumeThicknessInput = document.getElementById('material-volumethickness');
    const volumeAttenuationColorInput = document.getElementById('material-volumeattenuationcolor');
    const volumeAttenuationDistanceInput = document.getElementById('material-volumeattenuationdistance');
    const iridescenceFactorInput = document.getElementById('material-iridescencefactor');
    const iridescenceIorInput = document.getElementById('material-iridescenceior');
    const iridescenceThicknessMinimumInput = document.getElementById('material-iridescencethicknessminimum');
    const iridescenceThicknessMaximumInput = document.getElementById('material-iridescencethicknessmaximum');

    // Check if required inputs exist
    if (!baseColorInput) {
        console.error('Required input element material-basecolor not found');
        return;
    }

    console.log('All required input elements found, proceeding with UI update');

    // Get the actual Three.js material from model-viewer using the API
    const mv = document.getElementById('model');
    if (mv && mv.model && mv.model.materials) {
        // Use model-viewer API to get materials
        const materials = mv.model.materials;
        // Find material by index or name
        let actualMaterial = null;
        for (let i = 0; i < materials.length; i++) {
            const mat = materials[i];
            if (mat.name === selectedThreeMaterial.name || mat.index === selectedThreeMaterial.index) {
                actualMaterial = mat;
                break;
            }
        }

        if (actualMaterial) {
            selectedThreeMaterial = actualMaterial; // Update reference to actual material
            console.log('Found actual material:', actualMaterial.name);
        } else {
            console.log('Could not find actual material, using current reference');
        }
    }

    // Populate Material Properties section with actual values
    if (selectedThreeMaterial) {
        console.log('Updating Material Properties UI with:', selectedThreeMaterial);

        // Base Color
        if (baseColorInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor) {
            const rgba = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor;
            const hex = `#${Math.round(rgba[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgba[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgba[2] * 255).toString(16).padStart(2, '0')}`;
            baseColorInput.value = hex;
            console.log('Base color set to:', hex);
        }

        // Metallic and Roughness
        if (metallicInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.metallicFactor !== undefined) {
            metallicInput.value = selectedThreeMaterial.pbrMetallicRoughness.metallicFactor;
            console.log('Metallic set to:', selectedThreeMaterial.pbrMetallicRoughness.metallicFactor);
        }
        if (roughnessInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.roughnessFactor !== undefined) {
            roughnessInput.value = selectedThreeMaterial.pbrMetallicRoughness.roughnessFactor;
            console.log('Roughness set to:', selectedThreeMaterial.pbrMetallicRoughness.roughnessFactor);
        }

        // Emissive
        if (emissiveColorInput && selectedThreeMaterial.emissiveFactor) {
            const rgb = selectedThreeMaterial.emissiveFactor;
            const hex = `#${Math.round(rgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[2] * 255).toString(16).padStart(2, '0')}`;
            emissiveColorInput.value = hex;
            console.log('Emissive color set to:', hex);
        }
        if (emissiveIntensityInput && selectedThreeMaterial.emissiveStrength !== undefined) {
            emissiveIntensityInput.value = selectedThreeMaterial.emissiveStrength;
            console.log('Emissive intensity set to:', selectedThreeMaterial.emissiveStrength);
        }

        // Alpha
        if (alphaInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor) {
            alphaInput.value = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor[3] || 1;
            console.log('Alpha set to:', selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor[3]);
        }
        if (transparentCheckbox && selectedThreeMaterial.getAlphaMode) {
            transparentCheckbox.checked = selectedThreeMaterial.getAlphaMode() === 'BLEND';
            console.log('Transparent set to:', selectedThreeMaterial.getAlphaMode() === 'BLEND');
        }
    }

    // Get the actual Three.js material from model-viewer using the API
    const modelViewer = document.getElementById('model');
    if (modelViewer && modelViewer.model && modelViewer.model.materials) {
        // Use model-viewer API to get materials
        const materials = modelViewer.model.materials;
        // Find material by index or name
        let actualMaterial = null;
        for (let i = 0; i < materials.length; i++) {
            const mat = materials[i];
            if (mat.name === selectedThreeMaterial.name || mat.index === selectedThreeMaterial.index) {
                actualMaterial = mat;
                break;
            }
        }

        if (actualMaterial) {
            selectedThreeMaterial = actualMaterial; // Update reference to actual material
        }
    }

    // KHR_materials_specular extension properties
    if (selectedThreeMaterial.extensions && selectedThreeMaterial.extensions['KHR_materials_specular']) {
        const specularExtension = selectedThreeMaterial.extensions['KHR_materials_specular'];
        if (specularExtension.specularColor && specularColorInput) {
            specularColorInput.value = `#${new THREE.Color(...specularExtension.specularColor.slice(0, 3)).getHexString()}`;
        }
        if (specularExtension.specularFactor !== undefined && specularFactorInput) {
            specularFactorInput.value = specularExtension.specularFactor;
        }
    } else {
        // Reset to default or hide if extension not present
        if (specularColorInput) specularColorInput.value = '#ffffff';
        if (specularFactorInput) specularFactorInput.value = '1';
    }

    console.log('Specular extension properties set');

    // Populate Material Properties section with actual values
    if (selectedThreeMaterial) {
        console.log('Updating Material Properties UI with:', selectedThreeMaterial);

        try {
            // Base Color
            if (baseColorInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor) {
                const rgba = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor;
                const hex = `#${Math.round(rgba[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgba[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgba[2] * 255).toString(16).padStart(2, '0')}`;
                baseColorInput.value = hex;
                //console.log('Base color set to:', hex);
            }

            // Metallic and Roughness
            if (metallicInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.metallicFactor !== undefined) {
                metallicInput.value = selectedThreeMaterial.pbrMetallicRoughness.metallicFactor;
                //console.log('Metallic set to:', selectedThreeMaterial.pbrMetallicRoughness.metallicFactor);
            }
            if (roughnessInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.roughnessFactor !== undefined) {
                roughnessInput.value = selectedThreeMaterial.pbrMetallicRoughness.roughnessFactor;
                //console.log('Roughness set to:', selectedThreeMaterial.pbrMetallicRoughness.roughnessFactor);
            }

            // Emissive
            if (emissiveColorInput && selectedThreeMaterial.emissiveFactor) {
                const rgb = selectedThreeMaterial.emissiveFactor;
                const hex = `#${Math.round(rgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[2] * 255).toString(16).padStart(2, '0')}`;
                emissiveColorInput.value = hex;
                //console.log('Emissive color set to:', hex);
            }
            if (emissiveIntensityInput && selectedThreeMaterial.emissiveStrength !== undefined) {
                emissiveIntensityInput.value = selectedThreeMaterial.emissiveStrength;
                //console.log('Emissive intensity set to:', selectedThreeMaterial.emissiveStrength);
            }

            // Alpha
            if (alphaInput && selectedThreeMaterial.pbrMetallicRoughness && selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor) {
                alphaInput.value = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor[3] || 1;
                //console.log('Alpha set to:', selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor[3]);
            }
            if (transparentCheckbox && selectedThreeMaterial.getAlphaMode) {
                transparentCheckbox.checked = selectedThreeMaterial.getAlphaMode() === 'BLEND';
                //console.log('Transparent set to:', selectedThreeMaterial.getAlphaMode() === 'BLEND');
            }

            // Alpha Mode
            const alphaModeSelect = document.getElementById('material-alpha-mode');
            if (alphaModeSelect && selectedThreeMaterial.getAlphaMode) {
                alphaModeSelect.value = selectedThreeMaterial.getAlphaMode();
                //console.log('Alpha mode set to:', selectedThreeMaterial.getAlphaMode());
            }

            // Alpha Cutoff
            const alphaCutoffEl = document.getElementById('material-alpha-cutoff');
            if (alphaCutoffEl && selectedThreeMaterial.getAlphaCutoff) {
                alphaCutoffEl.value = selectedThreeMaterial.getAlphaCutoff();
                //console.log('Alpha cutoff set to:', selectedThreeMaterial.getAlphaCutoff());
            }

            // Update alpha cutoff visibility
            const alphaCutoffRow = document.getElementById('alpha-cutoff-row');
            if (alphaCutoffRow && alphaModeSelect) {
                alphaCutoffRow.style.display = alphaModeSelect.value === 'MASK' ? 'block' : 'none';
            }

            // Double Sided
            const doubleSidedEl = document.getElementById('material-double-sided');
            if (doubleSidedEl && selectedThreeMaterial.getDoubleSided) {
                doubleSidedEl.checked = selectedThreeMaterial.getDoubleSided();
                //console.log('Double sided set to:', selectedThreeMaterial.getDoubleSided());
            }
        } catch (error) {
            console.error('Error updating material properties:', error);
        }
    }

    // Populate UI with current material properties (fallback for Three.js materials)
    // Only use fallback if model-viewer API didn't work
    if (!selectedThreeMaterial.pbrMetallicRoughness) {
        console.log('Using Three.js fallback for material properties');
        try {
            if (selectedThreeMaterial.color && baseColorInput) {
                baseColorInput.value = `#${selectedThreeMaterial.color.getHexString()}`;
            }
            if (selectedThreeMaterial.metalness !== undefined && metallicInput) {
                metallicInput.value = selectedThreeMaterial.metalness;
            }
            if (selectedThreeMaterial.roughness !== undefined && roughnessInput) {
                roughnessInput.value = selectedThreeMaterial.roughness;
            }
            if (selectedThreeMaterial.emissive && emissiveColorInput) {
                emissiveColorInput.value = `#${selectedThreeMaterial.emissive.getHexString()}`;
            }
            if (selectedThreeMaterial.emissiveIntensity !== undefined && emissiveIntensityInput) {
                emissiveIntensityInput.value = selectedThreeMaterial.emissiveIntensity;
            }
            if (selectedThreeMaterial.aoMapIntensity !== undefined && occlusionStrengthInput) {
                occlusionStrengthInput.value = selectedThreeMaterial.aoMapIntensity;
            }
            if (selectedThreeMaterial.opacity !== undefined && alphaInput) {
                alphaInput.value = selectedThreeMaterial.opacity;
            }
            if (selectedThreeMaterial.transparent !== undefined && transparentCheckbox) {
                transparentCheckbox.checked = selectedThreeMaterial.transparent;
            }
        } catch (error) {
            console.error('Error in Three.js fallback:', error);
        }
    }

    // KHR_materials_clearcoat extension properties
    if (selectedThreeMaterial.extensions && selectedThreeMaterial.extensions['KHR_materials_clearcoat']) {
        const clearcoatExtension = selectedThreeMaterial.extensions['KHR_materials_clearcoat'];
        if (clearcoatExtension.clearcoatFactor !== undefined && clearcoatFactorInput) {
            clearcoatFactorInput.value = clearcoatExtension.clearcoatFactor;
        }
        if (clearcoatExtension.clearcoatRoughness !== undefined && clearcoatRoughnessInput) {
            clearcoatRoughnessInput.value = clearcoatExtension.clearcoatRoughness;
        }
    } else {
        // Reset to default or hide if extension not present
        if (clearcoatFactorInput) clearcoatFactorInput.value = '0';
        if (clearcoatRoughnessInput) clearcoatRoughnessInput.value = '0';
    }

    console.log('Clearcoat extension properties set');

    // KHR_materials_sheen extension properties
    if (selectedThreeMaterial.extensions && selectedThreeMaterial.extensions['KHR_materials_sheen']) {
        const sheenExtension = selectedThreeMaterial.extensions['KHR_materials_sheen'];
        if (sheenExtension.sheenColor && sheenColorInput) {
            sheenColorInput.value = `#${new THREE.Color(...sheenExtension.sheenColor.slice(0, 3)).getHexString()}`;
        }
        if (sheenExtension.sheenRoughness !== undefined && sheenRoughnessInput) {
            sheenRoughnessInput.value = sheenExtension.sheenRoughness;
        }
    } else {
        if (sheenColorInput) sheenColorInput.value = '#000000';
        if (sheenRoughnessInput) sheenRoughnessInput.value = '0';
    }

    console.log('Sheen extension properties set');

    // KHR_materials_transmission extension properties
    if (selectedThreeMaterial.extensions && selectedThreeMaterial.extensions['KHR_materials_transmission']) {
        const transmissionExtension = selectedThreeMaterial.extensions['KHR_materials_transmission'];
        if (transmissionExtension.transmissionFactor !== undefined && transmissionFactorInput) {
            transmissionFactorInput.value = transmissionExtension.transmissionFactor;
        }
    } else {
        if (transmissionFactorInput) transmissionFactorInput.value = '0';
    }

    console.log('Transmission extension properties set');

    // KHR_materials_volume extension properties
    if (selectedThreeMaterial.extensions && selectedThreeMaterial.extensions['KHR_materials_volume']) {
        const volumeExtension = selectedThreeMaterial.extensions['KHR_materials_volume'];
        if (volumeExtension.thickness !== undefined && volumeThicknessInput) {
            volumeThicknessInput.value = volumeExtension.thickness;
        }
        if (volumeExtension.attenuationColor && volumeAttenuationColorInput) {
            const rgb = volumeExtension.attenuationColor.slice(0, 3);
            const hex = `#${Math.round(rgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[2] * 255).toString(16).padStart(2, '0')}`;
            volumeAttenuationColorInput.value = hex;
        }
        if (volumeExtension.attenuationDistance !== undefined && volumeAttenuationDistanceInput) {
            volumeAttenuationDistanceInput.value = volumeExtension.attenuationDistance;
        }
    } else {
        if (volumeThicknessInput) volumeThicknessInput.value = '0';
        if (volumeAttenuationColorInput) volumeAttenuationColorInput.value = '#ffffff';
        if (volumeAttenuationDistanceInput) volumeAttenuationDistanceInput.value = '0';
    }

    console.log('Volume extension properties set');

    // KHR_materials_iridescence extension properties
    if (selectedThreeMaterial.extensions && selectedThreeMaterial.extensions['KHR_materials_iridescence']) {
        const iridescenceExtension = selectedThreeMaterial.extensions['KHR_materials_iridescence'];
        if (iridescenceExtension.iridescenceFactor !== undefined && iridescenceFactorInput) {
            iridescenceFactorInput.value = iridescenceExtension.iridescenceFactor;
        }
        if (iridescenceExtension.iridescenceIor !== undefined && iridescenceIorInput) {
            iridescenceIorInput.value = iridescenceExtension.iridescenceIor;
        }
        if (iridescenceExtension.iridescenceThicknessMinimum !== undefined && iridescenceThicknessMinimumInput) {
            iridescenceThicknessMinimumInput.value = iridescenceExtension.iridescenceThicknessMinimum;
        }
        if (iridescenceExtension.iridescenceThicknessMaximum !== undefined && iridescenceThicknessMaximumInput) {
            iridescenceThicknessMaximumInput.value = iridescenceExtension.iridescenceThicknessMaximum;
        }
    } else {
        if (iridescenceFactorInput) iridescenceFactorInput.value = '0';
        if (iridescenceIorInput) iridescenceIorInput.value = '1.3';
        if (iridescenceThicknessMinimumInput) iridescenceThicknessMinimumInput.value = '100';
        if (iridescenceThicknessMaximumInput) iridescenceThicknessMaximumInput.value = '400';
    }

    console.log('Iridescence extension properties set');


    // Add event listeners for UI changes - use setMaterialProperty function
    console.log('Setting up event listeners for material properties...');

    if (baseColorInput) {
        baseColorInput.onchange = (e) => {
            console.log('Base color changed to:', e.target.value);
            //console.log('Calling setMaterialProperty for baseColor');
            window.setMaterialProperty('baseColor', e.target.value);
            //console.log('setMaterialProperty call completed');
        };
        console.log('Base color event listener attached');
    } else {
        console.error('baseColorInput not found for event listener attachment');
    }

    if (metallicInput) {
        metallicInput.oninput = (e) => {
            console.log('Metallic changed to:', e.target.value);
            //console.log('Calling setMaterialProperty for metallic');
            window.setMaterialProperty('metallic', e.target.value);
            //console.log('setMaterialProperty call completed');
        };
        console.log('Metallic event listener attached');
    } else {
        console.error('metallicInput not found for event listener attachment');
    }

    // Add texture upload handlers
    console.log('Setting up texture upload handlers in index.html...');

    const baseColorTextureInput = document.getElementById('material-basecolor-texture');
    console.log('baseColorTextureInput:', baseColorTextureInput);
    if (baseColorTextureInput) {
        baseColorTextureInput.onchange = (e) => {
            console.log('Base color texture input changed in index.html');
            handleTextureUpload(e, 'baseColor');
        };
        console.log('Base color texture handler attached in index.html');
    } else {
        console.error('Base color texture input not found in index.html');
    }

    const metallicRoughnessTextureInput = document.getElementById('material-metallic-roughness-texture');
    console.log('metallicRoughnessTextureInput:', metallicRoughnessTextureInput);
    if (metallicRoughnessTextureInput) {
        metallicRoughnessTextureInput.onchange = (e) => {
            console.log('Metallic roughness texture input changed in index.html');
            handleTextureUpload(e, 'metallicRoughness');
        };
        console.log('Metallic roughness texture handler attached in index.html');
    } else {
        console.error('Metallic roughness texture input not found in index.html');
    }

    const normalTextureInput = document.getElementById('material-normal-texture');
    console.log('normalTextureInput:', normalTextureInput);
    if (normalTextureInput) {
        normalTextureInput.onchange = (e) => {
            console.log('Normal texture input changed in index.html');
            handleTextureUpload(e, 'normal');
        };
        console.log('Normal texture handler attached in index.html');
    } else {
        console.error('Normal texture input not found in index.html');
    }

    const emissiveTextureInput = document.getElementById('material-emissive-texture');
    console.log('emissiveTextureInput:', emissiveTextureInput);
    if (emissiveTextureInput) {
        emissiveTextureInput.onchange = (e) => {
            console.log('Emissive texture input changed in index.html');
            handleTextureUpload(e, 'emissive');
        };
        console.log('Emissive texture handler attached in index.html');
    } else {
        console.error('Emissive texture input not found in index.html');
    }

    const occlusionTextureInput = document.getElementById('material-occlusion-texture');
    console.log('occlusionTextureInput:', occlusionTextureInput);
    if (occlusionTextureInput) {
        occlusionTextureInput.onchange = (e) => {
            console.log('Occlusion texture input changed in index.html');
            handleTextureUpload(e, 'occlusion');
        };
        console.log('Occlusion texture handler attached in index.html');
    } else {
        console.error('Occlusion texture input not found in index.html');
    }

    console.log('Texture upload handlers setup completed in index.html');

    if (roughnessInput) {
        roughnessInput.oninput = (e) => {
            console.log('Roughness changed to:', e.target.value);
            //console.log('Calling setMaterialProperty for roughness');
            window.setMaterialProperty('roughness', e.target.value);
            //console.log('setMaterialProperty call completed');
        };
        console.log('Roughness event listener attached');
    } else {
        console.error('roughnessInput not found for event listener attachment');
    }

    if (emissiveColorInput) {
        emissiveColorInput.onchange = (e) => {
            console.log('Emissive color changed to:', e.target.value);
            const hex = e.target.value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            selectedThreeMaterial.setEmissiveFactor([r, g, b]);
            console.log('Updated emissive color');
        };
    }

    if (emissiveIntensityInput) {
        emissiveIntensityInput.oninput = (e) => {
            console.log('Emissive intensity changed to:', e.target.value);
            selectedThreeMaterial.setEmissiveStrength(parseFloat(e.target.value));
            console.log('Updated emissive intensity');
        };
    }

    if (alphaInput) {
        alphaInput.oninput = (e) => {
            console.log('Alpha changed to:', e.target.value);
            if (selectedThreeMaterial.pbrMetallicRoughness) {
                const rgba = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor;
                rgba[3] = parseFloat(e.target.value);
                selectedThreeMaterial.pbrMetallicRoughness.setBaseColorFactor(rgba);
                console.log('Updated alpha via model-viewer API');
            } else {
                selectedThreeMaterial.opacity = parseFloat(e.target.value);
                selectedThreeMaterial.transparent = selectedThreeMaterial.opacity < 1.0;
                selectedThreeMaterial.needsUpdate = true;
                console.log('Updated alpha via Three.js fallback');
            }
        };
    }

    if (transparentCheckbox) {
        transparentCheckbox.onchange = (e) => {
            console.log('Transparent changed to:', e.target.checked);
            if (selectedThreeMaterial.setAlphaMode) {
                selectedThreeMaterial.setAlphaMode(e.target.checked ? 'BLEND' : 'OPAQUE');
                console.log('Updated alpha mode via model-viewer API');
            } else {
                selectedThreeMaterial.transparent = e.target.checked;
                selectedThreeMaterial.needsUpdate = true;
                console.log('Updated transparent via Three.js fallback');
            }
        };
    }

    // Alpha Cutoff
    const alphaCutoffInput = document.getElementById('material-alpha-cutoff');
    if (alphaCutoffInput) {
        alphaCutoffInput.oninput = (e) => {
            console.log('Alpha cutoff changed to:', e.target.value);
            if (selectedThreeMaterial.setAlphaCutoff) {
                selectedThreeMaterial.setAlphaCutoff(parseFloat(e.target.value));
                console.log('Updated alpha cutoff via model-viewer API');
            }
        };
    }

    // Double Sided
    const doubleSidedCheckbox = document.getElementById('material-double-sided');
    if (doubleSidedCheckbox) {
        doubleSidedCheckbox.onchange = (e) => {
            console.log('Double sided changed to:', e.target.checked);
            if (selectedThreeMaterial.setDoubleSided) {
                selectedThreeMaterial.setDoubleSided(e.target.checked);
                console.log('Updated double sided via model-viewer API');
            }
        };
    }

    // Alpha Mode
    const alphaModeSelect = document.getElementById('material-alpha-mode');
    if (alphaModeSelect) {
        alphaModeSelect.onchange = (e) => {
            console.log('Alpha mode changed to:', e.target.value);
            if (selectedThreeMaterial.setAlphaMode) {
                selectedThreeMaterial.setAlphaMode(e.target.value);
                console.log('Updated alpha mode via model-viewer API');
                // Update alpha cutoff visibility
                const alphaCutoffRow = document.getElementById('alpha-cutoff-row');
                if (alphaCutoffRow) {
                    alphaCutoffRow.style.display = e.target.value === 'MASK' ? 'block' : 'none';
                }
                // Force re-render
                const mv = document.getElementById('model');
                if (mv && mv.model && typeof mv.model.dispatchEvent === 'function') {
                    mv.model.dispatchEvent(new CustomEvent('model-change'));
                } else {
                    console.warn('Cannot dispatch model-change event - model or dispatchEvent not available');
                }
            }
        };
    }

    // Alpha Factor
    const alphaFactorInput = document.getElementById('material-alpha-factor');
    if (alphaFactorInput) {
        alphaFactorInput.oninput = (e) => {
            console.log('Alpha factor changed to:', e.target.value);
            if (selectedThreeMaterial.pbrMetallicRoughness) {
                const rgba = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor;
                rgba[3] = parseFloat(e.target.value);
                selectedThreeMaterial.pbrMetallicRoughness.setBaseColorFactor(rgba);
                console.log('Updated alpha factor via model-viewer API');
            }
        };
    }

    // Event listeners for KHR_materials_specular
    if (specularColorInput) {
        specularColorInput.onchange = (e) => {
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_specular']) {
                selectedThreeMaterial.extensions['KHR_materials_specular'] = {
                    specularColor: [1, 1, 1, 1],
                    specularFactor: 1
                };
            }
            const hex = e.target.value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            selectedThreeMaterial.extensions['KHR_materials_specular'].specularColor = [r, g, b, 1];
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated specular color to:', [r, g, b]);
        };
    }
    if (specularFactorInput) {
        specularFactorInput.oninput = (e) => {
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_specular']) {
                selectedThreeMaterial.extensions['KHR_materials_specular'] = {
                    specularColor: [1, 1, 1, 1],
                    specularFactor: 1
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_specular'].specularFactor = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
        };
    }

    // Event listeners for KHR_materials_clearcoat
    if (clearcoatFactorInput) {
        clearcoatFactorInput.oninput = (e) => {
            console.log('Clearcoat factor changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_clearcoat']) {
                selectedThreeMaterial.extensions['KHR_materials_clearcoat'] = {
                    clearcoatFactor: 0,
                    clearcoatRoughness: 0
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_clearcoat'].clearcoatFactor = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated clearcoat factor');
        };
    }
    if (clearcoatRoughnessInput) {
        clearcoatRoughnessInput.oninput = (e) => {
            console.log('Clearcoat roughness changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_clearcoat']) {
                selectedThreeMaterial.extensions['KHR_materials_clearcoat'] = {
                    clearcoatFactor: 0,
                    clearcoatRoughness: 0
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_clearcoat'].clearcoatRoughness = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated clearcoat roughness');
        };
    }

    // Event listeners for KHR_materials_sheen
    if (sheenColorInput) {
        sheenColorInput.onchange = (e) => {
            console.log('Sheen color changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_sheen']) {
                selectedThreeMaterial.extensions['KHR_materials_sheen'] = {
                    sheenColor: [0, 0, 0, 1],
                    sheenRoughness: 0
                };
            }
            const hex = e.target.value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            selectedThreeMaterial.extensions['KHR_materials_sheen'].sheenColor = [r, g, b, 1];
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated sheen color to:', [r, g, b]);
        };
    }
    if (sheenRoughnessInput) {
        sheenRoughnessInput.oninput = (e) => {
            console.log('Sheen roughness changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_sheen']) {
                selectedThreeMaterial.extensions['KHR_materials_sheen'] = {
                    sheenColor: [0, 0, 0, 1],
                    sheenRoughness: 0
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_sheen'].sheenRoughness = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated sheen roughness');
        };
    }

    // Event listeners for KHR_materials_transmission
    if (transmissionFactorInput) {
        transmissionFactorInput.oninput = (e) => {
            console.log('Transmission factor changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_transmission']) {
                selectedThreeMaterial.extensions['KHR_materials_transmission'] = {
                    transmissionFactor: 0
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_transmission'].transmissionFactor = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated transmission factor');
        };
    }

    // Event listeners for KHR_materials_volume
    if (volumeThicknessInput) {
        volumeThicknessInput.oninput = (e) => {
            console.log('Volume thickness changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_volume']) {
                selectedThreeMaterial.extensions['KHR_materials_volume'] = {
                    thickness: 0,
                    attenuationColor: [1, 1, 1, 1],
                    attenuationDistance: 0
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_volume'].thickness = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated volume thickness');
        };
    }
    if (volumeAttenuationColorInput) {
        volumeAttenuationColorInput.onchange = (e) => {
            console.log('Volume attenuation color changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_volume']) {
                selectedThreeMaterial.extensions['KHR_materials_volume'] = {
                    thickness: 0,
                    attenuationColor: [1, 1, 1, 1],
                    attenuationDistance: 0
                };
            }
            const hex = e.target.value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            selectedThreeMaterial.extensions['KHR_materials_volume'].attenuationColor = [r, g, b, 1];
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated volume attenuation color');
        };
    }
    if (volumeAttenuationDistanceInput) {
        volumeAttenuationDistanceInput.oninput = (e) => {
            console.log('Volume attenuation distance changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_volume']) {
                selectedThreeMaterial.extensions['KHR_materials_volume'] = {
                    thickness: 0,
                    attenuationColor: [1, 1, 1, 1],
                    attenuationDistance: 0
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_volume'].attenuationDistance = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated volume attenuation distance');
        };
    }

    // Event listeners for KHR_materials_iridescence
    if (iridescenceFactorInput) {
        iridescenceFactorInput.oninput = (e) => {
            console.log('Iridescence factor changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_iridescence']) {
                selectedThreeMaterial.extensions['KHR_materials_iridescence'] = {
                    iridescenceFactor: 0,
                    iridescenceIor: 1.3,
                    iridescenceThicknessMinimum: 100,
                    iridescenceThicknessMaximum: 400
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_iridescence'].iridescenceFactor = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated iridescence factor');
        };
    }
    if (iridescenceIorInput) {
        iridescenceIorInput.oninput = (e) => {
            console.log('Iridescence IOR changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_iridescence']) {
                selectedThreeMaterial.extensions['KHR_materials_iridescence'] = {
                    iridescenceFactor: 0,
                    iridescenceIor: 1.3,
                    iridescenceThicknessMinimum: 100,
                    iridescenceThicknessMaximum: 400
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_iridescence'].iridescenceIor = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated iridescence IOR');
        };
    }
    if (iridescenceThicknessMinimumInput) {
        iridescenceThicknessMinimumInput.oninput = (e) => {
            console.log('Iridescence thickness minimum changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_iridescence']) {
                selectedThreeMaterial.extensions['KHR_materials_iridescence'] = {
                    iridescenceFactor: 0,
                    iridescenceIor: 1.3,
                    iridescenceThicknessMinimum: 100,
                    iridescenceThicknessMaximum: 400
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_iridescence'].iridescenceThicknessMinimum = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated iridescence thickness minimum');
        };
    }
    if (iridescenceThicknessMaximumInput) {
        iridescenceThicknessMaximumInput.oninput = (e) => {
            console.log('Iridescence thickness maximum changed to:', e.target.value);
            if (!selectedThreeMaterial.extensions) selectedThreeMaterial.extensions = {};
            if (!selectedThreeMaterial.extensions['KHR_materials_iridescence']) {
                selectedThreeMaterial.extensions['KHR_materials_iridescence'] = {
                    iridescenceFactor: 0,
                    iridescenceIor: 1.3,
                    iridescenceThicknessMinimum: 100,
                    iridescenceThicknessMaximum: 400
                };
            }
            selectedThreeMaterial.extensions['KHR_materials_iridescence'].iridescenceThicknessMaximum = parseFloat(e.target.value);
            selectedThreeMaterial.needsUpdate = true;
            console.log('Updated iridescence thickness maximum');
        };
    }
}
// Setup event listeners for material property changes
function setupMaterialEventListeners() {
    const baseColorInput = document.getElementById('material-basecolor');
    if (baseColorInput) {
        baseColorInput.onchange = (e) => {
        const hex = e.target.value;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        selectedThreeMaterial.pbrMetallicRoughness.setBaseColorFactor([r, g, b, 1]);
        };
    }

    const metallicInput = document.getElementById('material-metallic');
    if (metallicInput) {
        metallicInput.oninput = (e) => {
        selectedThreeMaterial.pbrMetallicRoughness.setMetallicFactor(parseFloat(e.target.value));
        };
    }

    const roughnessInput = document.getElementById('material-roughness');
    if (roughnessInput) {
        roughnessInput.oninput = (e) => {
        selectedThreeMaterial.pbrMetallicRoughness.setRoughnessFactor(parseFloat(e.target.value));
        };
    }

    const emissiveColorInput = document.getElementById('material-emissivecolor');
    if (emissiveColorInput) {
        emissiveColorInput.onchange = (e) => {
        const hex = e.target.value;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        selectedThreeMaterial.setEmissiveFactor([r, g, b]);
        };
    }

    // Alpha mode handling
    const alphaModeSelect = document.getElementById('material-alpha-mode');
    if (alphaModeSelect) {
        const alphaMode = selectedThreeMaterial.getAlphaMode();
        alphaModeSelect.value = alphaMode;

        // Show/hide alpha cutoff based on mode
        const alphaCutoffRow = document.getElementById('alpha-cutoff-row');
        if (alphaCutoffRow) {
        alphaCutoffRow.style.display = alphaMode === 'MASK' ? 'block' : 'none';
        }

        alphaModeSelect.onchange = (e) => {
        const mode = e.target.value;
        selectedThreeMaterial.setAlphaMode(mode);

        // Update alpha cutoff visibility
        if (alphaCutoffRow) {
            alphaCutoffRow.style.display = mode === 'MASK' ? 'block' : 'none';
        }
        };
    }

    const alphaCutoffInput = document.getElementById('material-alpha-cutoff');
    if (alphaCutoffInput) {
        alphaCutoffInput.value = selectedThreeMaterial.getAlphaCutoff();
        alphaCutoffInput.oninput = (e) => {
        selectedThreeMaterial.setAlphaCutoff(parseFloat(e.target.value));
        };
    }

    const alphaFactorInput = document.getElementById('material-alpha-factor');
    if (alphaFactorInput) {
        const baseColor = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor;
        alphaFactorInput.value = baseColor[3] || 1;
        alphaFactorInput.oninput = (e) => {
        const rgba = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor;
        rgba[3] = parseFloat(e.target.value);
        selectedThreeMaterial.pbrMetallicRoughness.setBaseColorFactor(rgba);
        };
    }

    const doubleSidedCheckbox = document.getElementById('material-double-sided');
    if (doubleSidedCheckbox) {
        doubleSidedCheckbox.checked = selectedThreeMaterial.getDoubleSided();
        doubleSidedCheckbox.onchange = (e) => {
        selectedThreeMaterial.setDoubleSided(e.target.checked);
        };
    }

    // Texture upload handlers
    console.log('Setting up texture upload handlers...');

    const baseColorTextureInput = document.getElementById('material-basecolor-texture');
    console.log('baseColorTextureInput:', baseColorTextureInput);
    if (baseColorTextureInput) {
        baseColorTextureInput.onchange = (e) => {
        console.log('Base color texture input changed');
        handleTextureUpload(e, 'baseColor');
        };
        console.log('Base color texture handler attached');
    } else {
        console.error('Base color texture input not found');
    }

    const metallicRoughnessTextureInput = document.getElementById('material-metallic-roughness-texture');
    console.log('metallicRoughnessTextureInput:', metallicRoughnessTextureInput);
    if (metallicRoughnessTextureInput) {
        metallicRoughnessTextureInput.onchange = (e) => {
        console.log('Metallic roughness texture input changed');
        handleTextureUpload(e, 'metallicRoughness');
        };
        console.log('Metallic roughness texture handler attached');
    } else {
        console.error('Metallic roughness texture input not found');
    }

    const normalTextureInput = document.getElementById('material-normal-texture');
    console.log('normalTextureInput:', normalTextureInput);
    if (normalTextureInput) {
        normalTextureInput.onchange = (e) => {
        console.log('Normal texture input changed');
        handleTextureUpload(e, 'normal');
        };
        console.log('Normal texture handler attached');
    } else {
        console.error('Normal texture input not found');
    }

    const emissiveTextureInput = document.getElementById('material-emissive-texture');
    console.log('emissiveTextureInput:', emissiveTextureInput);
    if (emissiveTextureInput) {
        emissiveTextureInput.onchange = (e) => {
        console.log('Emissive texture input changed');
        handleTextureUpload(e, 'emissive');
        };
        console.log('Emissive texture handler attached');
    } else {
        console.error('Emissive texture input not found');
    }

    const occlusionTextureInput = document.getElementById('material-occlusion-texture');
    console.log('occlusionTextureInput:', occlusionTextureInput);
    if (occlusionTextureInput) {
        occlusionTextureInput.onchange = (e) => {
        console.log('Occlusion texture input changed');
        handleTextureUpload(e, 'occlusion');
        };
        console.log('Occlusion texture handler attached');
    } else {
        console.error('Occlusion texture input not found');
    }

    console.log('Texture upload handlers setup completed');
}
// Global material selection
window.selectMaterialByIndex = function(materialIndex) {
    const modelViewer = document.getElementById('model');
    if (!modelViewer || !modelViewer.model || !modelViewer.model.materials) {
        console.error('Model or materials not available');
        return;
    }

    const materials = modelViewer.model.materials;
    if (materialIndex < 0 || materialIndex >= materials.length) {
        console.error('Invalid material index:', materialIndex);
        return;
    }

    const material = materials[materialIndex];
    const materialName = material.name;

    // Update global selection state
    selectedMaterialIndex = materialIndex;
    selectedMaterial = material;
    selectedThreeMaterial = material;
    selectedItemType = 'material';

    console.log('=== Unified Material Selection ===');
    console.log('Selected material index:', materialIndex);
    console.log('Selected material name:', materialName);

    // 1. Sync dropdown
    const select = document.getElementById('material-select');
    if (select) {
        select.selectedIndex = materialIndex + 1; // +1 for placeholder
    }

    // 2. Sync hierarchy selection
    document.querySelectorAll('.node-item').forEach(i => i.classList.remove('selected'));
    
    // 2a. Select in #materials-children using data-material-index
    const materialItem = document.querySelector(`#materials-children > .node-item[data-material-index="${materialIndex}"]`);
    let selectedElement = null;
    
    if (materialItem) {
        materialItem.classList.add('selected');
        selectedElement = materialItem;
        
        // Scroll into view if needed
        const container = document.getElementById('materials-children');
        if (container) {
            const containerRect = container.getBoundingClientRect();
            const itemRect = materialItem.getBoundingClientRect();
            if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
                materialItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
    
    // 2b. Also select corresponding material-child in #nodes-children (if exists)
    if (materialName) {
        const nodeMaterialItems = document.querySelectorAll('#nodes-children .material-child');
        for (const item of nodeMaterialItems) {
            const label = item.querySelector('.node-label');
            if (label && label.textContent === materialName) {
                item.classList.add('selected');
                // Also expand parent node
                const parentNode = item.closest('li.node-item.collapsible-header');
                if (parentNode) {
                    const childList = parentNode.nextElementSibling;
                    if (childList && childList.classList.contains('collapsed')) {
                        parentNode.classList.remove('collapsed');
                        childList.classList.remove('collapsed');
                    }
                }
            }
        }
    }
    
    selectedItem = selectedElement;

    // 3. Update Material Editor UI
    if (typeof window.updateMaterialEditorUI === 'function') {
        window.updateMaterialEditorUI();
    }

    console.log('Material selection synced across all UI elements');
};
// Clear material selection (when object is selected)
window.clearMaterialSelection = function() {
    console.log('Clearing material selection');
    selectedThreeMaterial = null;
    selectedMaterial = null;
    selectedMaterialIndex = -1;
    selectedItemType = 'object';
    
    // Clear dropdown
    const select = document.getElementById('material-select');
    if (select) {
        select.selectedIndex = 0;
    }
    
    // Clear hierarchy selection
    document.querySelectorAll('.node-item').forEach(i => i.classList.remove('selected'));
};
// New material state management system
window.materialState = {
    materials: {}, // Stores all material properties by index
    uvChannelPreferences: {}, // Stores UV channel preferences
    modelUrl: null // Current model URL for state persistence
};
// Initialize material state when model loads
function initializeMaterialState(modelUrl) {
    window.materialState.modelUrl = modelUrl;
    window.materialState.materials = {};
    window.materialState.uvChannelPreferences = {};
    console.log('Material state initialized for:', modelUrl);
}
// Save material property to state
function saveMaterialProperty(materialIndex, property, value, isImmediate = true) {
    if (!window.materialState.materials[materialIndex]) {
        window.materialState.materials[materialIndex] = {
            immediate: {}, // Properties that can be changed immediately via MV API
            persistent: {} // Properties that require GLTF reload
        };
    }

    const category = isImmediate ? 'immediate' : 'persistent';
    window.materialState.materials[materialIndex][category][property] = value;
    console.log(`Saved ${category} property ${property} = ${JSON.stringify(value)} for material ${materialIndex}`);
}
// Get material property from state
function getMaterialProperty(materialIndex, property, isImmediate = true) {
    const materialState = window.materialState.materials[materialIndex];
    if (!materialState) return null;

    const category = isImmediate ? 'immediate' : 'persistent';
    return materialState[category][property] || null;
}

// Global function for console testing of material properties
window.setMaterialProperty = (property, value) => {
    if (!selectedThreeMaterial) {
        console.error('No material selected');
        return;
    }

    switch (property) {
        case 'baseColor':
            if (selectedThreeMaterial.pbrMetallicRoughness) {
                // Clear base color texture to allow factor editing
                if (selectedThreeMaterial.pbrMetallicRoughness.baseColorTexture) {
                    selectedThreeMaterial.pbrMetallicRoughness.baseColorTexture.setTexture(null);
                    console.log('Cleared base color texture to allow factor editing');
                }
                const r = parseInt(value.slice(1, 3), 16) / 255;
                const g = parseInt(value.slice(3, 5), 16) / 255;
                const b = parseInt(value.slice(5, 7), 16) / 255;
                const currentAlpha = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor[3] || 1;
                selectedThreeMaterial.pbrMetallicRoughness.setBaseColorFactor([r, g, b, currentAlpha]);
                console.log('Updated base color to:', value);
                // Update UI
                const baseColorInput = document.getElementById('material-basecolor');
                if (baseColorInput) baseColorInput.value = value;
            }
            break;
        case 'metallic':
            if (selectedThreeMaterial.pbrMetallicRoughness) {
                selectedThreeMaterial.pbrMetallicRoughness.setMetallicFactor(parseFloat(value));
                console.log('Updated metallic to:', value);
                const metallicInput = document.getElementById('material-metallic');
                if (metallicInput) metallicInput.value = value;
            }
            break;
        case 'roughness':
            if (selectedThreeMaterial.pbrMetallicRoughness) {
                selectedThreeMaterial.pbrMetallicRoughness.setRoughnessFactor(parseFloat(value));
                console.log('Updated roughness to:', value);
                const roughnessInput = document.getElementById('material-roughness');
                if (roughnessInput) roughnessInput.value = value;
            }
            break;
        default:
            console.error('Unknown property:', property);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('Model viewer initialized');

    document.getElementById('model').addEventListener('load', async () => {
        console.log('Model loaded:', document.getElementById('model').src);
        document.getElementById('model').autoplay = false;
        document.getElementById('model').autoRotate = false;

        // Verify effects are loaded
        const effectComposer = document.querySelector('effect-composer');
        if (!effectComposer) {
            console.error('Effect composer not found in DOM');
        } else {
            console.log('Effect composer found:', effectComposer);
            console.log('Bloom effect:', effectComposer.querySelector('bloom-effect'));
            console.log('SSAO effect:', effectComposer.querySelector('ssao-effect'));
            console.log('SMAA effect:', effectComposer.querySelector('smaa-effect'));
        }

        // Build scene hierarchy when model loads
        const scene = document.getElementById('model').model;
        buildSceneHierarchy(scene);

        // Initialize material picker for material selection by click
        materialPicker = new MaterialPicker(document.getElementById('model'));

        // Populate materials dropdown
        populateMaterialDropdown();

        setTimeout(() => {
            //setupRenderingControls();
            setupNodeInteractions();
        }, 100); // Allow effects system to initialize
        // Force state refresh
        expandAllNodes();
        setTimeout(() => {
            collapseAllNodes();
            setupEffectControls();
            setupMaterialEventListeners();
        }, 50);
    });
    // Utility function to fetch and parse GLB data
    async function fetchAndParseGLB(modelUrl) {
        try {
            const response = await fetch(modelUrl);
            const buffer = await response.arrayBuffer();
            const dataView = new DataView(buffer);
            const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
            if (magic !== 'glTF') {
                throw new Error('Not a valid GLB file');
            }
            const jsonChunkLength = dataView.getUint32(12, true);
            const jsonChunk = new Uint8Array(buffer, 20, jsonChunkLength);
            const jsonText = new TextDecoder().decode(jsonChunk);
            return JSON.parse(jsonText);
        } catch (error) {
            console.error('Error fetching or parsing GLB:', error);
            throw error;
        }
    }
    //model error logger
    document.getElementById('model').addEventListener('error', (event) => {
        console.error('Model viewer error:', event.type, event.detail);
    });

    function cleanupSceneHierarchy() {
        // Remove all existing event listeners
        const sceneExplorer = document.querySelector('.scene-explorer');
        sceneExplorer.removeEventListener('click', handleNodeClick);
        document.getElementById('expand-all')?.removeEventListener('click', handleExpandAll);
        document.getElementById('collapse-all')?.removeEventListener('click', handleCollapseAll);
    }

    async function buildSceneHierarchy(scene) {
        cleanupSceneHierarchy();
        
        const nodesContainer = document.getElementById('nodes-children');
        const materialsContainer = document.getElementById('materials-children');
        const texturesContainer = document.getElementById('textures-children');
        
        nodesContainer.innerHTML = '';
        materialsContainer.innerHTML = '';
        texturesContainer.innerHTML = '';
        
        try {
            // Get GLB data from model-viewer
            const modelUrl = document.getElementById('model').src;
            const response = await fetch(modelUrl);
            const buffer = await response.arrayBuffer();
            
            // Parse GLB header
            const dataView = new DataView(buffer);
            const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
            if (magic !== 'glTF') {
                throw new Error('Not a valid GLB file');
            }
            
            // Get JSON chunk
            const jsonChunkLength = dataView.getUint32(12, true);
            const jsonChunk = new Uint8Array(buffer, 20, jsonChunkLength);
            const jsonText = new TextDecoder().decode(jsonChunk);
            const gltfData = JSON.parse(jsonText);
            
            // Build hierarchy from GLTF nodes
            function buildNodeList(parentElement, nodeId, depth = 0) {
                const node = gltfData.nodes[nodeId];
                if (!node) return;
                
                const li = document.createElement('li');
                const hasChildren = node.children?.length;
                const hasMesh = node.mesh !== undefined;
                li.className = `node-item ${hasChildren || hasMesh ? 'collapsible-header' : ''}`;
                li.style.paddingLeft = `${10 + depth * 10}px`;
                
                const name = node.name || `Node ${nodeId}`;
                const type = node.mesh !== undefined ? 'mesh' : 
                            node.camera !== undefined ? 'camera' : 
                            'node';
                const icon = type === 'mesh' ? 'logos/blender_icon_mesh_uvsphere.svg' : 
                            type === 'camera' ? 'logos/blender_icon_node_material.svg' : 
                            'logos/blender_icon_empty_data.svg';
                
                li.innerHTML = `
                    <img src="${icon}" class="node-icon" width="16" height="16">
                    <span class="node-label">${name}</span>
                    ${hasChildren || hasMesh ? '<span class="collapsible-icon"></span>' : ''}
                `;
                
                parentElement.appendChild(li);
                
                // Add material children if node has mesh
                if (node.mesh !== undefined) {
                    const mesh = gltfData.meshes[node.mesh];
                    const materialList = document.createElement('ul');
                    materialList.className = 'node-list material-children collapsed';
                    parentElement.appendChild(materialList);
                    
                    let hasMaterials = false;
                    mesh.primitives.forEach((primitive, idx) => {
                        if (primitive.material !== undefined) {
                            hasMaterials = true;
                            const material = gltfData.materials[primitive.material];
                            const materialLi = document.createElement('li');
                            materialLi.className = 'node-item material-child';
                            materialLi.innerHTML = `
                                <img src="logos/blender_icon_node_material.svg" 
                                     class="node-icon" width="16" height="16">
                                <span class="node-label">
                                    ${material.name || `Material ${idx + 1}`}
                                </span>
                            `;
                            materialList.appendChild(materialLi);
                        }
                    });
                    
                    if (!hasMaterials) {
                        const noMaterialLi = document.createElement('li');
                        noMaterialLi.className = 'node-item material-child';
                        noMaterialLi.innerHTML = `
                            <img src="logos/blender_icon_cancel.svg" 
                                 class="node-icon" width="16" height="16">
                            <span class="node-label">No materials</span>
                        `;
                        materialList.appendChild(noMaterialLi);
                    }
                }
                
                // Handle children if they exist
                if (node.children && node.children.length > 0) {
                    const childList = document.createElement('ul');
                    childList.className = 'node-list';
                    parentElement.appendChild(childList);
                    
                    node.children.forEach(childId => {
                        buildNodeList(childList, childId, depth + 1);
                    });
                }
            }
            
            // Get root nodes - first try scene.nodes, then fallback to unreferenced nodes
            let rootNodes = [];
            if (gltfData.scenes?.[0]?.nodes) {
                rootNodes = gltfData.scenes[0].nodes;
            } else {
                rootNodes = gltfData.nodes
                    ?.map((_, i) => i)
                    ?.filter(id => !gltfData.nodes.some(n => n.children?.includes(id))) || [];
            }
                
            rootNodes.forEach(nodeId => {
                buildNodeList(nodesContainer, nodeId);
            });

            // Build materials and textures lists
            buildMaterialsList(gltfData);
            buildTexturesList(gltfData);
            
        } catch (error) {
            console.error('Error parsing GLB:', error);
            nodesContainer.innerHTML = '<li class="node-item">Error loading hierarchy</li>';
        }
    }

    function buildMaterialsList(gltfData) {
        const materialsList = document.getElementById('materials-children');
        materialsList.innerHTML = '';

        // Only show "No materials" if the entire model has no materials
        if (!gltfData.materials || gltfData.materials.length === 0) {
            // Check if there are any meshes in the model
            const hasMeshes = gltfData.meshes && gltfData.meshes.length > 0;
            if (hasMeshes) {
                materialsList.innerHTML = '<li class="node-item"><img src="logos/blender_icon_node_material.svg" class="node-icon" width="16" height="16"><span class="node-label">No materials</span></li>';
            }
            return;
        }

            gltfData.materials.forEach((material, index) => {
                const li = document.createElement('li');
                li.className = 'node-item collapsible-header';
                li.setAttribute('data-material-index', index); // Store material index
                const targetId = `material-${index}-textures`;
                li.setAttribute('data-target', targetId);
                li.innerHTML = `
                    <img src="logos/blender_icon_node_material.svg" class="node-icon" width="16" height="16">
                    <span class="node-label">${material.name || `Material ${index}`}</span>
                `;

                materialsList.appendChild(li);

                // Create child list for textures
                const texturesList = document.createElement('ul');
                texturesList.id = targetId;
                texturesList.className = 'node-list collapsed';
                materialsList.appendChild(texturesList);

            // Add textures if material has them
            if (material.pbrMetallicRoughness) {
                const pbr = material.pbrMetallicRoughness;
                if (pbr.baseColorTexture) {
                    addTextureItem(texturesList, 'Base Color', pbr.baseColorTexture.index, gltfData);
                }
                if (pbr.metallicRoughnessTexture) {
                    addTextureItem(texturesList, 'Metallic/Roughness', pbr.metallicRoughnessTexture.index, gltfData);
                }
            }
            if (material.normalTexture) {
                addTextureItem(texturesList, 'Normal', material.normalTexture.index, gltfData);
            }
            if (material.occlusionTexture) {
                addTextureItem(texturesList, 'Occlusion', material.occlusionTexture.index, gltfData);
            }
            if (material.emissiveTexture) {
                addTextureItem(texturesList, 'Emissive', material.emissiveTexture.index, gltfData);
            }
        });
    }

    async function populateMaterialDropdown() {
        const select = document.getElementById('material-select');
        if (!select) return;

        // Clear existing options (except the first placeholder)
        select.innerHTML = '<option disabled selected>Select material</option>';

        try {
            const modelViewer = document.getElementById('model');
            if (!modelViewer || !modelViewer.src) {
                console.log('No model loaded yet');
                return;
            }

            // Get GLTF data directly from the model URL
            const response = await fetch(modelViewer.src);
            const buffer = await response.arrayBuffer();

            // Parse GLB header
            const dataView = new DataView(buffer);
            const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
            if (magic !== 'glTF') {
                throw new Error('Not a valid GLB file');
            }

            // Get JSON chunk
            const jsonChunkLength = dataView.getUint32(12, true);
            const jsonChunk = new Uint8Array(buffer, 20, jsonChunkLength);
            const jsonText = new TextDecoder().decode(jsonChunk);
            const gltfData = JSON.parse(jsonText);

            // Populate dropdown from GLTF materials
            if (gltfData.materials && gltfData.materials.length > 0) {
                gltfData.materials.forEach((material, index) => {
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = material.name || `Material ${index + 1}`;
                    select.appendChild(option);
                });
                console.log(`Populated dropdown with ${gltfData.materials.length} materials`);
            } else {
                console.log('No materials found in GLTF');
                const option = document.createElement('option');
                option.disabled = true;
                option.textContent = 'No materials found';
                select.appendChild(option);
            }
        } catch (error) {
            console.error('Error populating material dropdown:', error);
            const option = document.createElement('option');
            option.disabled = true;
            option.textContent = 'Error loading materials';
            select.appendChild(option);
        }
    }

    function buildTexturesList(gltfData) {
        const texturesList = document.getElementById('textures-children');
        texturesList.innerHTML = '';

        if (!gltfData.textures || gltfData.textures.length === 0) {
            texturesList.innerHTML = '<li class="node-item"><img src="logos/blender_icon_texture.svg" class="node-icon" width="16" height="16"><span class="node-label">No textures</span></li>';
            return;
        }

        gltfData.textures.forEach((texture, index) => {
            const li = document.createElement('li');
            li.className = 'node-item';
            
            const image = gltfData.images?.[texture.source];
            const textureName = image?.name || `Texture ${index}`;
            
            li.innerHTML = `
                <img src="logos/blender_icon_texture.svg" class="node-icon" width="16" height="16">
                <span class="node-label">${textureName}</span>
            `;
            texturesList.appendChild(li);
        });
    }

    function addTextureItem(parent, name, textureIndex, gltfData) {
        const li = document.createElement('li');
        li.className = 'node-item';
        
        const texture = gltfData.textures?.[textureIndex];
        const image = texture ? gltfData.images?.[texture.source] : null;
        const textureName = image?.name || name;
        
        li.innerHTML = `
            <img src="logos/blender_icon_texture.svg" class="node-icon" width="16" height="16">
            <span class="node-label">${textureName}</span>
        `;
        parent.appendChild(li);
    }

    function setupPropertyInputListeners() {
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab || activeTab.getAttribute('data-tab-content') !== 'editing') return;
        
        const objectPropsSection = activeTab.querySelector('.panel-section:first-child');
        if (!objectPropsSection) return;
        
        // Remove existing event listeners
        const positionInput = objectPropsSection.querySelector('.position-input');
        const rotationInput = objectPropsSection.querySelector('.rotation-input');
        const scaleInput = objectPropsSection.querySelector('.scale-input');
        
        if (positionInput) {
            positionInput.oninput = null;
            positionInput.addEventListener('input', () => {
                if (currentNodeIndex !== null) {
                    updateNodeProperty(currentNodeIndex, 'translation', positionInput.value);
                }
            });
        }
        
        if (rotationInput) {
            rotationInput.oninput = null;
            rotationInput.addEventListener('input', () => {
                if (currentNodeIndex !== null) {
                    updateNodeProperty(currentNodeIndex, 'rotation', rotationInput.value);
                }
            });
        }
        
        if (scaleInput) {
            scaleInput.oninput = null;
            scaleInput.addEventListener('input', () => {
                if (currentNodeIndex !== null) {
                    updateNodeProperty(currentNodeIndex, 'scale', scaleInput.value);
                }
            });
        }
    }
    
    function updateNodeProperty(nodeIndex, property, value) {
        console.log(`Updating node ${nodeIndex} ${property} to:`, value);
        // Parse the comma-separated string into an array of numbers
        const values = value.split(',').map(v => parseFloat(v.trim()));
        if (values.length === 3 && values.every(v => !isNaN(v))) {
            // Get the model-viewer element
            const modelViewer = document.getElementById('model');
            if (modelViewer.model) {
                // Get scene and nodes
                const scene = modelViewer.model;
                const nodes = scene.nodes || [];
                
                // Update the node's property
                const node = nodes[nodeIndex];
                if (node) {
                    if (property === 'translation') {
                        node.position.set(values[0], values[1], values[2]);
                    } else if (property === 'rotation') {
                        node.rotation.set(values[0], values[1], values[2]);
                    } else if (property === 'scale') {
                        node.scaling.set(values[0], values[1], values[2]);
                    }
                }
            }
        } else {
            console.error('Invalid property value:', value);
        }
    }
    //
    //
    //Inspector panel
    async function updateInspectorPanels() {
        if (!selectedItemType || !selectedItem) return;
        
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab || activeTab.getAttribute('data-tab-content') !== 'editing') return;
        
        const objectPropsSection = activeTab.querySelector('.panel-section:first-child');
        const shaderPropsSection = activeTab.querySelector('.panel-section:first-child');

        setupPropertyInputListeners();
    }

    function collapseAllNodes() {
        document.querySelectorAll('.node-item').forEach(item => {
            // Skip "Scene" element
            if (item.getAttribute('data-target') === 'scene-children') return;

            if (item.nextElementSibling && item.nextElementSibling.classList.contains('node-list')) {
                item.classList.add('collapsed');
                item.nextElementSibling.classList.add('collapsed');
            }
        });
    }

    function expandAllNodes() {
        document.querySelectorAll('.node-item').forEach(item => {
            if (item.nextElementSibling && item.nextElementSibling.classList.contains('node-list')) {
                item.classList.remove('collapsed');
                item.nextElementSibling.classList.remove('collapsed');
            }
        });
    }

    function handleCollapseAll(e) {
        e.stopPropagation();
        collapseAllNodes();
    }

    function handleExpandAll(e) {
        e.stopPropagation();
        expandAllNodes();
    }

    function handleNodeClick(e) {
        console.log('>>> handleNodeClick triggered', e.target);
        const item = e.target.closest('.node-item');
        if (!item) {
            console.log('No .node-item found, returning');
            return;
        }
        console.log('Clicked item:', item, 'classes:', item.className);

        // Handle collapsible items first (expand/collapse)
        if (item.classList.contains('collapsible-header')) {
            // Find the associated child list (check both data-target and next sibling)
            const targetId = item.getAttribute('data-target');
            let childList = targetId ? document.getElementById(targetId) : null;

            if (!childList && item.nextElementSibling?.classList?.contains('node-list')) {
                childList = item.nextElementSibling;
            }

            if (childList) {
                // Toggle collapsed state
                const isCollapsed = item.classList.toggle('collapsed');
                childList.classList.toggle('collapsed', isCollapsed);

                // Force display style for material texture lists
                if (item.closest('#materials-children') && !isCollapsed) {
                    childList.style.display = 'block';
                }
            }
            // Don't return - allow selection after expand/collapse
        }

        // Handle selection
        if (!item.classList.contains('selected')) {
            document.querySelectorAll('.node-item').forEach(i => {
                i.classList.remove('selected');
            });
            item.classList.add('selected');
        }

        // Determine item type and handle selection
        if (item.classList.contains('material-child')) {
            // Material child under a node - get material name and find index
            const materialName = item.querySelector('.node-label').textContent.trim();
            console.log('Selected Material (from node):', materialName);
            selectedItem = item;

            // Find material index by name and use unified system
            const mv = document.getElementById('model');
            if (mv && mv.model && mv.model.materials) {
                const materials = mv.model.materials;
                const materialIndex = materials.findIndex(mat => mat.name === materialName);

                if (materialIndex !== -1) {
                    console.log('Found material index:', materialIndex);
                    window.selectMaterialByIndex(materialIndex);
                } else {
                    console.warn('Material not found by name:', materialName);
                    window.clearMaterialSelection();
                }
            }
            updateInspectorPanels();
            return; // Важно: не продолжать обработку для других условий

        } else if (item.closest('#nodes-children')) {
            // Object/node selection
            window.clearMaterialSelection();
            updateInspectorPanels();

            const nodeInfo = {
                name: item.querySelector('.node-label').textContent,
                type: 'object',
                gltfIndex: Array.from(item.parentNode.children).indexOf(item),
                properties: {
                    position: '0, 0, 0',
                    rotation: '0, 0, 0',
                    scale: '1, 1, 1'
                }
            };
            console.log('Selected Object:', nodeInfo);
            selectedItem = item;

        } else if (item.closest('#materials-children')) {
            // Material selection from materials list - use unified system
            const materialIndex = parseInt(item.getAttribute('data-material-index'));
            console.log('Selected Material from list, index:', materialIndex);
            selectedItem = item;

            // Use unified material selection system
            if (window.selectMaterialByIndex && !isNaN(materialIndex)) {
                window.selectMaterialByIndex(materialIndex);
            } else {
                console.warn('Invalid material index or selectMaterialByIndex not available');
                window.clearMaterialSelection();
            }
            return; // Early return - unified system already handled everything
        }

        console.log('Selection Updated:', {
            element: item,
            type: selectedItemType,
            parentList: item.closest('ul').id
        });
    }

    function setupNodeInteractions() {
        // Use event delegation for all node items
        document.querySelector('.scene-explorer').addEventListener('click', handleNodeClick);
        // Expand/Collapse-all buttons
        document.getElementById('expand-all')?.addEventListener('click', handleExpandAll);
        document.getElementById('collapse-all')?.addEventListener('click', handleCollapseAll);
    }
    // Section collapsing functionality
    document.querySelector('.inspector').addEventListener('click', (e) => {
        const header = e.target.closest('.section-header');
        if (!header || !header.classList.contains('collapsible-header')) return;
        
        const content = header.nextElementSibling;
        if (content && content.classList.contains('section-content')) {
            const isCollapsed = content.classList.toggle('collapsed');
            const icon = header.querySelector('.collapsible-icon');
            if (icon) {
                icon.src = isCollapsed ? 
                    'logos/blender_icon_rightarrow.svg' : 
                    'logos/blender_icon_downarrow_hlt.svg';
            }
        }
    });
    // Add selection style to existing CSS
    const style = document.createElement('style');
    style.textContent = `
        .node-item.selected {
            background-color: #37373d;
            border-left: 2px solid #2196F3;
        }

        .expand-controls {
            display: flex;
            gap: 5px;
        }

        .expand-btn {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            background-color: #3a3a3a;
            border: 1px solid #555;
            color: #f0f0f0;
            font-size: 16px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
        }

        .expand-btn:hover {
            background-color: #4a4a4a;
        }

        .expand-btn:active {
            transform: scale(0.95);
        }
    `;
    document.head.appendChild(style);
    //

    //Materials
    //
    // Material Picker class for selecting materials by clicking on the model
    class MaterialPicker {
        constructor(modelViewer) {
            this.modelViewer = modelViewer;
            this.setupEventListeners();
        }

        setupEventListeners() {
            let isDragging = false;

            this.modelViewer.addEventListener('pointerdown', () => {
            isDragging = false;
            });

            this.modelViewer.addEventListener('pointermove', () => {
            isDragging = true;
            });

            this.modelViewer.addEventListener('pointerup', (event) => {
            if (!isDragging) {
                this.onClick(event);
            }
            });
        }

        onClick(event) {
            const pickedMaterial = this.modelViewer.materialFromPoint(
            event.clientX, event.clientY
            );

            if (pickedMaterial) {
            console.log('Selected material:', pickedMaterial.name);

            // Find the material index in the model's materials array
            const materials = this.modelViewer.model.materials;
            const materialIndex = materials.findIndex(mat => mat === pickedMaterial);

            if (materialIndex !== -1) {
                this.selectMaterial(materialIndex);
                }
            }
        }

        selectMaterial(index) {
            // Use unified material selection system
            if (window.selectMaterialByIndex) {
                window.selectMaterialByIndex(index);
            } else {
                // Fallback to legacy behavior
                selectedMaterialIndex = index;
                selectedMaterial = this.modelViewer.model.materials[index];
                console.log('MaterialPIDAR:', selectedMaterial);

                const select = document.getElementById('material-select');
                if (select) {
                    select.selectedIndex = selectedMaterialIndex + 1;
                }
                
                document.querySelectorAll('.node-item').forEach(i => i.classList.remove('selected'));

                // Use data-material-index attribute instead of indexOf
                const materialItem = document.querySelector(`#materials-children > .node-item[data-material-index="${index}"]`);
                if (materialItem) {
                    materialItem.classList.add('selected');
                    selectedItem = materialItem;
                    selectedItemType = 'material';
                } else {
                    console.warn('Material item not found in DOM for index', index);
                }

                updateMaterialEditorUI(selectedMaterial);
                console.log('Material selected at index:', index);
            }
        }
    }

// Handle texture upload
window.handleTextureUpload = async function(event, textureType) {
        console.log('=== TEXTURE UPLOAD DEBUG ===');
        console.log('Event:', event);
        console.log('Texture type:', textureType);
        console.log('Event target:', event.target);
        console.log('Files:', event.target.files);

        const file = event.target.files[0];
        if (!file) {
            console.error('No file selected');
            return;
        }

        console.log('Selected file:', file);
        console.log('File name:', file.name);
        console.log('File type:', file.type);
        console.log('File size:', file.size);

        if (!selectedMaterial) {
            console.error('No material selected');
            console.log('selectedMaterial:', selectedMaterial);
            console.log('selectedThreeMaterial:', selectedThreeMaterial);
            return;
        }

        console.log('Selected material:', selectedMaterial);
        console.log('Material name:', selectedMaterial.name);
        console.log('Material pbrMetallicRoughness:', selectedMaterial.pbrMetallicRoughness);

        // Validate file type
        if (!file.type.startsWith('image/')) {
            console.error('Selected file is not an image');
            alert('Please select a valid image file');
            return;
        }

        try {
            console.log(`Uploading ${textureType} texture:`, file.name);
            const modelViewer = document.getElementById('model');
            console.log('Model viewer:', modelViewer);
            console.log('Model viewer model:', modelViewer.model);

            const texture = await modelViewer.createTexture(URL.createObjectURL(file), file.type);
            console.log('Created texture:', texture);

            // Get UV channel preference for this texture type
            const uvChannel = window.uvChannelPreferences ? window.uvChannelPreferences[textureType] : 0;
            console.log(`Using UV channel ${uvChannel} for ${textureType} texture`);

            switch (textureType) {
            case 'baseColor':
                console.log('Setting base color texture...');
                console.log('pbrMetallicRoughness:', selectedMaterial.pbrMetallicRoughness);
                console.log('baseColorTexture:', selectedMaterial.pbrMetallicRoughness?.baseColorTexture);
                if (selectedMaterial.pbrMetallicRoughness && selectedMaterial.pbrMetallicRoughness.baseColorTexture) {
                selectedMaterial.pbrMetallicRoughness.baseColorTexture.setTexture(texture);
                // Set UV channel if available
                if (selectedMaterial.pbrMetallicRoughness.baseColorTexture.setTexCoord) {
                    selectedMaterial.pbrMetallicRoughness.baseColorTexture.setTexCoord(uvChannel);
                    console.log(`Set base color texture UV channel to ${uvChannel}`);
                }
                console.log('Base color texture set successfully');
                } else {
                console.error('Base color texture property not available');
                console.log('Available properties:', Object.keys(selectedMaterial.pbrMetallicRoughness || {}));
                }
                break;
            case 'metallicRoughness':
                console.log('Setting metallic roughness texture...');
                if (selectedMaterial.pbrMetallicRoughness && selectedMaterial.pbrMetallicRoughness.metallicRoughnessTexture) {
                selectedMaterial.pbrMetallicRoughness.metallicRoughnessTexture.setTexture(texture);
                // Set UV channel if available
                if (selectedMaterial.pbrMetallicRoughness.metallicRoughnessTexture.setTexCoord) {
                    selectedMaterial.pbrMetallicRoughness.metallicRoughnessTexture.setTexCoord(uvChannel);
                    console.log(`Set metallic roughness texture UV channel to ${uvChannel}`);
                }
                console.log('Metallic roughness texture set successfully');
                } else {
                console.error('Metallic roughness texture property not available');
                }
                break;
            case 'normal':
                console.log('Setting normal texture...');
                console.log('normalTexture:', selectedMaterial.normalTexture);
                if (selectedMaterial.normalTexture) {
                selectedMaterial.normalTexture.setTexture(texture);
                // Set UV channel if available
                if (selectedMaterial.normalTexture.setTexCoord) {
                    selectedMaterial.normalTexture.setTexCoord(uvChannel);
                    console.log(`Set normal texture UV channel to ${uvChannel}`);
                }
                console.log('Normal texture set successfully');
                } else {
                console.error('Normal texture property not available');
                console.log('Available properties:', Object.keys(selectedMaterial));
                }
                break;
            case 'emissive':
                console.log('Setting emissive texture...');
                console.log('emissiveTexture:', selectedMaterial.emissiveTexture);
                if (selectedMaterial.emissiveTexture) {
                selectedMaterial.emissiveTexture.setTexture(texture);
                // Set UV channel if available
                if (selectedMaterial.emissiveTexture.setTexCoord) {
                    selectedMaterial.emissiveTexture.setTexCoord(uvChannel);
                    console.log(`Set emissive texture UV channel to ${uvChannel}`);
                }
                console.log('Emissive texture set successfully');
                } else {
                console.error('Emissive texture property not available');
                console.log('Available properties:', Object.keys(selectedMaterial));
                }
                break;
            case 'occlusion':
                console.log('Setting occlusion texture...');
                console.log('occlusionTexture:', selectedMaterial.occlusionTexture);
                if (selectedMaterial.occlusionTexture) {
                selectedMaterial.occlusionTexture.setTexture(texture);
                // Set UV channel if available
                if (selectedMaterial.occlusionTexture.setTexCoord) {
                    selectedMaterial.occlusionTexture.setTexCoord(uvChannel);
                    console.log(`Set occlusion texture UV channel to ${uvChannel}`);
                }
                console.log('Occlusion texture set successfully');
                } else {
                console.error('Occlusion texture property not available');
                console.log('Available properties:', Object.keys(selectedMaterial));
                }
                break;
            default:
                console.error('Unknown texture type:', textureType);
                return;
            }

            console.log(`Texture uploaded successfully for ${textureType}`);
            console.log('=== END TEXTURE UPLOAD DEBUG ===');
        } catch (error) {
            console.error('Error uploading texture:', error);
            console.error('Error stack:', error.stack);
            alert(`Failed to upload ${textureType} texture: ${error.message}`);
        }
    }
    // Update material properties section
    function updateMaterialProperties(shaderPropsSection, material, materialName) {
        const colorInput = shaderPropsSection.querySelector('input[type="color"]');
        const materialSelect = shaderPropsSection.querySelector('select');

        if (materialSelect) {
            materialSelect.innerHTML = `<option>${materialName}</option>`;
        }

        if (colorInput) {
            // Use selectedThreeMaterial instead of GLTF data for color
            if (selectedThreeMaterial?.pbrMetallicRoughness?.baseColorFactor) {
                const rgb = selectedThreeMaterial.pbrMetallicRoughness.baseColorFactor;
                const hex = `#${Math.round(rgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[2] * 255).toString(16).padStart(2, '0')}`;
                colorInput.value = hex;
                console.log('Updated color input to:', hex, 'from selectedThreeMaterial');
            } else {
                colorInput.value = '#ffffff';
            }

            colorInput.onchange = () => {
                console.log('Color changed to:', colorInput.value);
                window.setMaterialProperty('baseColor', colorInput.value);
            };
        }
    }
    // Post-processing 
    // Connect rendering controls to model-viewer effects
    function setupEffectControls() {
        const mv = document.querySelector('model-viewer#model');
        const renderingTab = document.querySelector('[data-tab-content="rendering"]');
        
        if (!renderingTab) {
            console.error('Rendering tab not found');
            return;
        }

        // Function to check if effects are available
        const checkEffectsAvailable = () => {
            const effects = {
                bloom: mv.querySelector('bloom-effect'),
                ssao: mv.querySelector('ssao-effect'),
                smaa: mv.querySelector('smaa-effect')
            };
            return effects.bloom && effects.ssao && effects.smaa;
        };

        // Function to setup effect controls once effects are available
        const setupControlsWhenReady = () => {
            if (checkEffectsAvailable()) {
                setupEffectControlsNow();
            } else {
                setTimeout(setupControlsWhenReady, 100);
            }
        };

        // Actual control setup function
        const setupEffectControlsNow = () => {
            const effects = {
                bloom: mv.querySelector('bloom-effect'),
                ssao: mv.querySelector('ssao-effect'),
                smaa: mv.querySelector('smaa-effect')
            };

            if (!effects.bloom || !effects.ssao || !effects.smaa) {
                console.error('Some effects not found:', effects);
                return;
            }

            // Bloom controls
            const bloomEnabled = renderingTab.querySelector('[data-control="bloom-enabled"]');
            const bloomStrength = renderingTab.querySelector('[data-control="bloom-strength"]');
            const bloomThreshold = renderingTab.querySelector('[data-control="bloom-threshold"]');
            const bloomRadius = renderingTab.querySelector('[data-control="bloom-radius"]');
            const bloomSmoothing = renderingTab.querySelector('[data-control="bloom-smoothing"]');

            if (bloomEnabled) {
                bloomEnabled.checked = effects.bloom.enabled;
                bloomEnabled.addEventListener('change', (e) => {
                    effects.bloom.enabled = e.target.checked;
                    console.log('Bloom effect toggled:', e.target.checked);
                });
            }

            if (bloomStrength) {
                bloomStrength.value = effects.bloom.strength;
                bloomStrength.addEventListener('input', (e) => {
                    effects.bloom.setAttribute('strength', e.target.value);
                    console.log('Bloom strength:', e.target.value);
                });
            }

            if (bloomThreshold) {
                bloomThreshold.value = effects.bloom.threshold;
                bloomThreshold.addEventListener('input', (e) => {
                    effects.bloom.setAttribute('threshold', e.target.value);
                    console.log('Bloom threshold:', e.target.value);
                });
            }

            if (bloomRadius) {
                bloomRadius.value = effects.bloom.radius;
                bloomRadius.addEventListener('input', (e) => {
                    effects.bloom.setAttribute('radius', e.target.value);
                    console.log('Bloom radius:', e.target.value);
                });
            }

            if (bloomSmoothing) {
                bloomSmoothing.value = effects.bloom.smoothing;
                bloomSmoothing.addEventListener('input', (e) => {
                    effects.bloom.setAttribute('smoothing', e.target.value);
                    console.log('Bloom smoothing:', e.target.value);
                });
            }

            if (bloomThreshold) {
                bloomThreshold.value = effects.bloom.threshold;
                bloomThreshold.addEventListener('input', (e) => {
                    effects.bloom.threshold = parseFloat(e.target.value);
                    console.log('Bloom threshold:', e.target.value);
                });
            }

            // SSAO controls
            const ssaoEnabled = renderingTab.querySelector('[data-control="ssao-enabled"]');
            const ssaoStrength = renderingTab.querySelector('[data-control="ssao-intensity"]');

            if (ssaoEnabled) {
                ssaoEnabled.checked = effects.ssao.enabled;
                ssaoEnabled.addEventListener('change', (e) => {
                    effects.ssao.enabled = e.target.checked;
                    console.log('SSAO effect toggled:', e.target.checked);
                });
            }

            if (ssaoStrength) {
                ssaoStrength.value = effects.ssao.strength;
                ssaoStrength.addEventListener('input', (e) => {
                    effects.ssao.setAttribute('strength', e.target.value);
                    console.log('SSAO strength:', e.target.value);
                });
            }

            // SMAA controls
            const smaaEnabled = renderingTab.querySelector('[data-control="smaa-enabled"]');
            const smaaQuality = renderingTab.querySelector('[data-control="smaa-quality"]');

            if (smaaEnabled) {
                smaaEnabled.checked = effects.smaa.enabled;
                smaaEnabled.addEventListener('change', (e) => {
                    effects.smaa.enabled = e.target.checked;
                    console.log('SMAA effect toggled:', e.target.checked);
                });
            }

            if (smaaQuality) {
                smaaQuality.value = effects.smaa.getAttribute('quality') || 'high';
                smaaQuality.addEventListener('change', (e) => {
                    effects.smaa.setAttribute('quality', e.target.value.toLowerCase());
                    console.log('SMAA quality:', e.target.value);
                });
            }

            console.log('Effect controls setup completed');
        };

        // Start the setup process
        setupControlsWhenReady();
    }
    // Setup rendering controls when tab is activated
    document.querySelector('.tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        
        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Show corresponding content
        const tabName = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.remove('active');
            if (c.getAttribute('data-tab-content') === tabName) {
                c.classList.add('active');
                if (tabName === 'rendering') {
                    setupEffectControls();
                }
            }
        });
    });
    // Also setup controls when model loads
    document.getElementById('model').addEventListener('load', () => {
        setTimeout(() => {
            setupEffectControls();
            setupTonemapperControls();
        }, 500); // Give effects time to initialize
    });
    // Initialize tonemapper controls on page load
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupTonemapperControls, 100);
    });
    // Setup tonemapper controls using model-viewer API
    function setupTonemapperControls() {
        const tonemapperSelect = document.getElementById('tonemapper-select');
        const modelViewer = document.getElementById('model');

        if (tonemapperSelect && modelViewer) {
            // Set initial value
            tonemapperSelect.value = modelViewer.getAttribute('tone-mapping') || 'aces';

            // Add change listener
            tonemapperSelect.addEventListener('change', (e) => {
                const selectedValue = e.target.value;
                modelViewer.setAttribute('tone-mapping', selectedValue);
                console.log('Tonemapper changed to:', selectedValue);
            });

            console.log('Tonemapper controls setup completed');
        } else {
            console.error('Tonemapper select or model-viewer not found');
        }
    }
    // Setup tonemapper controls when rendering tab is activated
    document.querySelector('.tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;

        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show corresponding content
        const tabName = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.remove('active');
            if (c.getAttribute('data-tab-content') === tabName) {
                c.classList.add('active');
                if (tabName === 'rendering') {
                    setupEffectControls();
                    setupTonemapperControls();
                }
            }
        });
    });

    // Background color functionality
    const hdriBackgroundToggle = document.getElementById('hdri-background-toggle');
    const backgroundColorRow = document.getElementById('background-color-row');
    const backgroundColorInput = document.getElementById('background-color-input');

    if (hdriBackgroundToggle && backgroundColorRow && backgroundColorInput) {
        // Toggle background color row visibility
        hdriBackgroundToggle.addEventListener('change', (e) => {
            backgroundColorRow.style.display = e.target.checked ? 'block' : 'none';
        });

        // Initialize background color from Blender data
        const viewerContainer = document.getElementById('viewer-container-id');
        if (viewerContainer && viewerContainer.dataset.bgColor) {
            const [r, g, b] = viewerContainer.dataset.bgColor.split(',').map(x => Math.round(parseFloat(x) * 255));
            const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            backgroundColorInput.value = hexColor;
            viewerContainer.style.setProperty('background-color', `rgb(${r}, ${g}, ${b})`, 'important');
        }

        // Update model-viewer background color
        backgroundColorInput.addEventListener('input', (e) => {
            const viewerContainer = document.getElementById('viewer-container-id');
            if (viewerContainer) {
                const color = e.target.value;
                // Convert hex to rgb
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                viewerContainer.style.setProperty('background-color', `rgb(${r}, ${g}, ${b})`, 'important');
                console.log('Background color updated to:', color);
            }
        });
    }

    // Drag and drop handlers
    const modelViewer = document.getElementById('model');
    //
    modelViewer.addEventListener('dragover', (e) => {
        e.preventDefault();
        modelViewer.style.border = '2px dashed #2196F3';
    });
    //
    modelViewer.addEventListener('dragleave', () => {
        modelViewer.style.border = '';
    });
    //
    modelViewer.addEventListener('drop', (e) => {
        e.preventDefault();
        modelViewer.style.border = '';
        
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
            const url = URL.createObjectURL(file);
            modelViewer.src = url;
        }
    });

    //update dropdown for materials
    document.getElementById('material-select')?.addEventListener('change', (e) => {
        const selectedIndex = e.target.selectedIndex - 1; // because first option is placeholder
        if (selectedIndex < 0) return;

        // Use unified material selection system
        if (window.selectMaterialByIndex) {
            window.selectMaterialByIndex(selectedIndex);
        }
    });
    // File input handlers
    document.getElementById('load-model-btn').addEventListener('click', () => {
        document.getElementById('model-input').click();
    });
    //
    document.getElementById('model-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            document.getElementById('model').src = url;
        }
    });

    // ========================================================================
    // БЛОК ЭКСПОРТА (GLB / USDZ)
    // ========================================================================
    // Подход: используем импортированный Three.js для конвертации текстур
    // и экспорта, а model-viewer только как источник GLB
    
    // ------------------------------------------------------------------------
    // 1. Экспорт в GLB (через model-viewer API)
    // ------------------------------------------------------------------------
    async function exportGLB(modelViewerElement) {
        const blob = await modelViewerElement.exportScene({ binary: true });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scene.glb';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    document.getElementById('exportGLB').addEventListener('click', () => {
        console.log('Export GLB Button click');
        exportGLB(modelViewer);
    });
    
    // ------------------------------------------------------------------------
    // 2. Утилиты для конвертации текстур
    // ------------------------------------------------------------------------
    /**
     * Возвращает THREE из импортированного модуля.
     */
    function getTHREE() {
        return THREE;
    }
    
    /**
     * Конвертирует изображение в Blob с указанным форматом и качеством.
     * @param {HTMLImageElement|ImageBitmap} image - Исходное изображение
     * @param {string} mimeType - Формат: 'image/jpeg', 'image/webp', 'image/png'
     * @param {number} quality - Качество от 0 до 1 (игнорируется для PNG)
     */
    function imageToBlob(image, mimeType, quality = 0.92) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const w = image.width || image.naturalWidth || 0;
            const h = image.height || image.naturalHeight || 0;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, w, h);
            canvas.toBlob((blob) => resolve(blob), mimeType, quality);
        });
    }

    /**
     * Конвертирует одну текстуру: масштабирует и перекодирует в нужный формат.
     * @param {HTMLImageElement|ImageBitmap} srcImage - Исходное изображение
     * @param {string} targetFormat - Целевой формат MIME
     * @param {number} quality - Качество сжатия
     * @param {number} maxSize - Максимальный размер в пикселях
     */
    async function convertSingleTexture(srcImage, targetFormat, quality, maxSize) {
        const THREE = getTHREE();
        
        // Отладка
        console.log(`convertSingleTexture: формат=${targetFormat}, качество=${quality}, maxSize=${maxSize}`);

        // Определяем размеры
        const naturalW = srcImage.naturalWidth || srcImage.width;
        const naturalH = srcImage.naturalHeight || srcImage.height;
        let destW = naturalW;
        let destH = naturalH;

        console.log(`Исходный размер текстуры: ${naturalW}x${naturalH}`);

        // Масштабируем, если превышает maxSize
        if (Math.max(naturalW, naturalH) > maxSize) {
            const ratio = maxSize / Math.max(naturalW, naturalH);
            destW = Math.max(1, Math.round(naturalW * ratio));
            destH = Math.max(1, Math.round(naturalH * ratio));
            console.log(`Масштабирование до: ${destW}x${destH}`);
        }

        // Рисуем в canvas с целевым размером
        const canvas = document.createElement('canvas');
        canvas.width = destW;
        canvas.height = destH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(srcImage, 0, 0, destW, destH);

        // Конвертируем в Blob с нужным форматом/качеством
        const blob = await new Promise((resolve) => {
            canvas.toBlob((b) => {
                console.log(`Blob создан: тип=${b.type}, размер=${b.size} байт`);
                resolve(b);
            }, targetFormat, quality);
        });

        // Создаём ImageBitmap для быстрой работы
        const bitmap = await createImageBitmap(blob);

        // Создаём Three.js текстуру из canvas (для совместимости с экспортерами)
        const newTex = new THREE.CanvasTexture(canvas);
        newTex.colorSpace = THREE.SRGBColorSpace;
        newTex.flipY = false;
        newTex.needsUpdate = true;

        return newTex;
    }

    /**
     * Конвертирует все текстуры в сцене Three.js.
     * Обрабатывает: map, roughnessMap, metalnessMap, normalMap, aoMap, emissiveMap, alphaMap
     * @param {THREE.Object3D} sceneRoot - Корневой объект сцены
     * @param {string} targetFormat - Формат текстур (MIME)
     * @param {number} quality - Качество сжатия
     * @param {number} maxSize - Максимальный размер текстуры
     */
    async function convertTexturesInScene(sceneRoot, targetFormat, quality, maxSize) {
        if (!sceneRoot) return;

        const promises = [];

        sceneRoot.traverse((node) => {
            processNodeForConversion(node, targetFormat, quality, maxSize, promises);
        });

        await Promise.all(promises);
        console.log('Конвертация текстур завершена');
    }
    
    /**
     * Обрабатывает один узел сцены для конвертации текстур.
     */
    function processNodeForConversion(node, targetFormat, quality, maxSize, promises) {
        // Проверяем, это меш с материалом
        if (node.isMesh && node.material) {
            console.log(`Найден меш: ${node.name || 'unnamed'}, материалы:`, Array.isArray(node.material) ? node.material.length : 1);
            
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            
            mats.forEach((mat, matIndex) => {
                console.log(`  Материал ${matIndex}: ${mat.name || 'unnamed'}`);
                
                const textureSlots = [
                    'map', 'roughnessMap', 'metalnessMap',
                    'normalMap', 'aoMap', 'emissiveMap', 'alphaMap'
                ];

                textureSlots.forEach((mapName) => {
                    const tex = mat[mapName];
                    if (tex && tex.image) {
                        console.log(`    ${mapName}: текстура найдена, размер=${tex.image.width}x${tex.image.height}`);
                        
                        const img = tex.image;

                        const promise = (async () => {
                            try {
                                // Ждём загрузки, если это HTMLImageElement
                                if (img instanceof HTMLImageElement && !img.complete) {
                                    await new Promise((r) => img.addEventListener('load', r));
                                }

                                console.log(`    Конвертация ${mapName}...`);
                                const newTex = await convertSingleTexture(img, targetFormat, quality, maxSize);
                                mat[mapName] = newTex;
                                mat.needsUpdate = true;
                                console.log(`    ${mapName} сконвертирована`);
                            } catch (e) {
                                console.warn(`    Failed to convert texture ${mapName}:`, e);
                            }
                        })();

                        promises.push(promise);
                    } else {
                        console.log(`    ${mapName}: нет текстуры`);
                    }
                });
            });
        }
    }

    // 3. Экспорт в USDZ (с конвертацией текстур через Three.js)
    /**
     * Основной поток экспорта USDZ:
     * 1. Экспортируем GLB из model-viewer
     * 2. Загружаем в нашу сцену Three.js через GLTFLoader
     * 3. Конвертируем текстуры
     * 4. Экспортируем USDZ через THREE.USDZExporter
     */
    async function exportUSDZ(modelViewerElement) {
        // Читаем настройки из UI
        const formatSelect = document.getElementById('texture-format');
        const qualitySlider = document.getElementById('texture-quality');
        const maxSizeSelect = document.getElementById('texture-max-size');

        const targetFormat = formatSelect ? formatSelect.value : 'image/jpeg';
        const quality = qualitySlider ? parseFloat(qualitySlider.value) : 0.8;
        const maxSize = maxSizeSelect ? parseInt(maxSizeSelect.value) : 1024;

        try {
            const THREE = getTHREE();

            console.log(`Конвертация текстур: ${targetFormat}, качество: ${quality}, макс. размер: ${maxSize}`);

            // Шаг 1: Экспортируем GLB из model-viewer
            console.log('Шаг 1: Экспорт GLB из model-viewer...');
            const glbBlob = await modelViewerElement.exportScene({ binary: true });
            console.log(`GLB экспортирован, размер: ${glbBlob.size} байт`);

            // Шаг 2: Загружаем GLB в нашу сцену через GLTFLoader
            console.log('Шаг 2: Загрузка GLB в сцену Three.js...');
            const loader = new GLTFLoader();
            const glbUrl = URL.createObjectURL(glbBlob);
            
            const gltf = await new Promise((resolve, reject) => {
                loader.load(
                    glbUrl,
                    resolve,
                    (progress) => {
                        console.log(`Загрузка: ${Math.round(progress.loaded / progress.total * 100)}%`);
                    },
                    reject
                );
            });
            
            URL.revokeObjectURL(glbUrl);
            
            const scene = gltf.scene;
            console.log('Модель загружена в сцену Three.js');
            console.log('Дочерние объекты сцены:', scene.children.length);

            // Шаг 3: Конвертируем текстуры в сцене
            console.log('Шаг 3: Конвертация текстур...');
            await convertTexturesInScene(scene, targetFormat, quality, maxSize);
            
            // Debug: Проверяем текстуры после конвертации
            console.log('Debug: Проверка текстур после конвертации:');
            scene.traverse((node) => {
                if (node.isMesh && node.material) {
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach((mat, i) => {
                        console.log(`  ${node.name}: Материал ${i}`);
                        ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap'].forEach(slot => {
                            const tex = mat[slot];
                            if (tex) {
                                console.log(`    ${slot}: ${tex.constructor.name}, image=${tex.image?.constructor?.name}`);
                            }
                        });
                    });
                }
            });

            // Debug: Проверяем геометрию
            console.log('Debug: Проверка геометрии:');
            scene.traverse((node) => {
                if (node.isMesh && node.geometry) {
                    const geo = node.geometry;
                    console.log(`  ${node.name}: ${geo.type}`);
                    console.log(`    attributes:`, Object.keys(geo.attributes));
                    console.log(`    uv:`, geo.attributes.uv ? 'yes' : 'no');
                    console.log(`    normal:`, geo.attributes.normal ? 'yes' : 'no');
                    console.log(`    position:`, geo.attributes.position ? 'yes' : 'no');
                }
            });

            // Debug: Пробуем экспортировать оригинальную сцену без конвертации
            console.log('Debug: Тест экспорта оригинальной сцены (до конвертации)...');
            const testExporter = new USDZExporter();
            try {
                const testGlbBlob = await modelViewerElement.exportScene({ binary: true });
                const testGlbUrl = URL.createObjectURL(testGlbBlob);
                const testGltf = await new Promise((resolve, reject) => {
                    new GLTFLoader().load(testGlbUrl, resolve, null, reject);
                });
                URL.revokeObjectURL(testGlbUrl);
                
                console.log('Debug: Экспорт оригинальной сцены в USDZ...');
                const testData = await testExporter.parse(testGltf.scene, { maxTextureSize: maxSize });
                console.log('Debug: Оригинал USDZ размер:', testData?.length || 'unknown');
            } catch (e) {
                console.error('Debug: Ошибка теста:', e);
            }

            // Шаг 4: Экспортируем USDZ через USDZExporter
            console.log('Шаг 4: Экспорт USDZ...');
            
            // Проверяем сцену перед экспортом
            console.log('Проверка сцены перед экспортом USDZ:');
            console.log('- Количество объектов:', scene.children.length);
            
            const exporter = new USDZExporter();

            // Пробуем parseAsync если доступен, иначе parse
            let usdzData;
            if (typeof exporter.parseAsync === 'function') {
                console.log('Использую parseAsync...');
                usdzData = await exporter.parseAsync(scene, {
                    ar: {
                        anchor: {
                            type: 'plane',
                            buffer: 0.5,
                            removeImage: true
                        }
                    },
                    maxTextureSize: maxSize
                });
            } else {
                console.log('Использую parse...');
                usdzData = await exporter.parse(scene, {
                    ar: {
                        anchor: {
                            type: 'plane',
                            buffer: 0.5,
                            removeImage: true
                        }
                    },
                    maxTextureSize: maxSize
                });
            }

            console.log('Raw результат parse:', usdzData, typeof usdzData, usdzData?.length);

            // parse возвращает Uint8Array, создаем Blob
            const usdzBlob = new Blob([usdzData], { type: 'application/zip' });
            console.log(`USDZ создан, размер: ${usdzBlob.size} байт`);

            // Скачиваем файл
            const a = document.createElement('a');
            const usdzUrl = URL.createObjectURL(usdzBlob);
            a.href = usdzUrl;
            a.download = 'model.usdz';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(usdzUrl);

            console.log('USDZ экспорт завершён успешно');
        } catch (err) {
            console.error('Ошибка при экспорте USDZ:', err);
        }
    }

    document.getElementById('exportUSDZ').addEventListener('click', () => {
        console.log('Export USDZ Button click');
        exportUSDZ(modelViewer);
    });

    // Обновление отображения значения качества
    const qualitySlider = document.getElementById('texture-quality');
    const qualityValue = document.getElementById('quality-value');
    if (qualitySlider && qualityValue) {
        qualitySlider.addEventListener('input', (e) => {
            qualityValue.textContent = e.target.value;
        });
    }

});
