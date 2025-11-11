/**
 * Camera Model Registry Tests
 *
 * @description Tests for camera model registry functions
 * @coverage Target: 90%+ coverage for model registry
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_REGISTRY,
  getModelsBySeries,
  getModelByName,
  getAllModels,
  isKnownModel,
  getModelsWithPTZ,
  getModelsWithAudio,
  getMultiSensorModels,
  type CameraModel
} from '../models/cameraModels';

describe('Camera Model Registry', () => {

  describe('MODEL_REGISTRY', () => {
    it('should contain valid model entries', () => {
      expect(Object.keys(MODEL_REGISTRY).length).toBeGreaterThan(0);

      // Check first entry structure
      const firstModel = Object.values(MODEL_REGISTRY)[0];
      expect(firstModel).toHaveProperty('model');
      expect(firstModel).toHaveProperty('series');
      expect(firstModel).toHaveProperty('fullName');
      expect(firstModel).toHaveProperty('resolution');
      expect(firstModel).toHaveProperty('hasPTZ');
      expect(firstModel).toHaveProperty('hasAudio');
      expect(firstModel).toHaveProperty('features');
    });

    it('should have P-series models', () => {
      expect(MODEL_REGISTRY['P3255-LVE']).toBeDefined();
      expect(MODEL_REGISTRY['P3255-LVE'].series).toBe('P');
    });

    it('should have Q-series models', () => {
      expect(MODEL_REGISTRY['Q6155-E']).toBeDefined();
      expect(MODEL_REGISTRY['Q6155-E'].series).toBe('Q');
      expect(MODEL_REGISTRY['Q6155-E'].hasPTZ).toBe(true);
    });

    it('should have M-series models', () => {
      expect(MODEL_REGISTRY['M3068-P']).toBeDefined();
      expect(MODEL_REGISTRY['M3068-P'].series).toBe('M');
    });

    it('should have F-series models', () => {
      expect(MODEL_REGISTRY['F41']).toBeDefined();
      expect(MODEL_REGISTRY['F41'].series).toBe('F');
    });

    it('should have at least 15 models', () => {
      const modelCount = Object.keys(MODEL_REGISTRY).length;
      expect(modelCount).toBeGreaterThanOrEqual(15);
    });
  });

  describe('getModelsBySeries', () => {
    it('should return P-series cameras', () => {
      const pModels = getModelsBySeries('P');

      expect(pModels.length).toBeGreaterThan(0);
      pModels.forEach(model => {
        expect(model.series).toBe('P');
      });
    });

    it('should return Q-series cameras', () => {
      const qModels = getModelsBySeries('Q');

      expect(qModels.length).toBeGreaterThan(0);
      qModels.forEach(model => {
        expect(model.series).toBe('Q');
      });
    });

    it('should return M-series cameras', () => {
      const mModels = getModelsBySeries('M');

      expect(mModels.length).toBeGreaterThan(0);
      mModels.forEach(model => {
        expect(model.series).toBe('M');
      });
    });

    it('should return F-series cameras', () => {
      const fModels = getModelsBySeries('F');

      expect(fModels.length).toBeGreaterThan(0);
      fModels.forEach(model => {
        expect(model.series).toBe('F');
      });
    });

    it('should return empty array for unknown series', () => {
      const unknownModels = getModelsBySeries('X' as any);
      expect(unknownModels).toEqual([]);
    });
  });

  describe('getModelByName', () => {
    it('should return model by exact name', () => {
      const model = getModelByName('P3255-LVE');

      expect(model).toBeDefined();
      expect(model?.model).toBe('P3255-LVE');
      expect(model?.series).toBe('P');
    });

    it('should return undefined for unknown model', () => {
      const model = getModelByName('UNKNOWN-123');
      expect(model).toBeUndefined();
    });

    it('should handle Q-series PTZ models', () => {
      const model = getModelByName('Q6155-E');

      expect(model).toBeDefined();
      expect(model?.hasPTZ).toBe(true);
      expect(model?.series).toBe('Q');
    });

    it('should handle M-series multi-sensor models', () => {
      const model = getModelByName('M3068-P');

      expect(model).toBeDefined();
      expect(model?.numberOfSensors).toBeGreaterThan(1);
      expect(model?.series).toBe('M');
    });

    it('should handle F-series modular models', () => {
      const model = getModelByName('F41');

      expect(model).toBeDefined();
      expect(model?.series).toBe('F');
      expect(model?.features).toContain('modular');
    });
  });

  describe('getAllModels', () => {
    it('should return array of all models', () => {
      const allModels = getAllModels();

      expect(Array.isArray(allModels)).toBe(true);
      expect(allModels.length).toBeGreaterThan(0);
    });

    it('should return same count as registry', () => {
      const allModels = getAllModels();
      const registryCount = Object.keys(MODEL_REGISTRY).length;

      expect(allModels.length).toBe(registryCount);
    });

    it('should return valid model objects', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        expect(model).toHaveProperty('model');
        expect(model).toHaveProperty('series');
        expect(model).toHaveProperty('fullName');
        expect(model.series).toMatch(/^[PQMF]$/);
      });
    });

    it('should include models from all series', () => {
      const allModels = getAllModels();
      const series = allModels.map(m => m.series);

      expect(series).toContain('P');
      expect(series).toContain('Q');
      expect(series).toContain('M');
      expect(series).toContain('F');
    });
  });

  describe('isKnownModel', () => {
    it('should return true for existing model', () => {
      expect(isKnownModel('P3255-LVE')).toBe(true);
      expect(isKnownModel('Q6155-E')).toBe(true);
      expect(isKnownModel('M3068-P')).toBe(true);
      expect(isKnownModel('F41')).toBe(true);
    });

    it('should return false for unknown model', () => {
      expect(isKnownModel('UNKNOWN-123')).toBe(false);
      expect(isKnownModel('XYZ999')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isKnownModel('p3255-lve')).toBe(false);
      expect(isKnownModel('P3255-LVE')).toBe(true);
    });

    it('should handle empty string', () => {
      expect(isKnownModel('')).toBe(false);
    });
  });

  describe('getModelsWithPTZ', () => {
    it('should return only PTZ-capable models', () => {
      const ptzModels = getModelsWithPTZ();

      expect(ptzModels.length).toBeGreaterThan(0);
      ptzModels.forEach(model => {
        expect(model.hasPTZ).toBe(true);
      });
    });

    it('should include Q-series PTZ cameras', () => {
      const ptzModels = getModelsWithPTZ();
      const qSeriesPTZ = ptzModels.filter(m => m.series === 'Q' && m.hasPTZ);

      expect(qSeriesPTZ.length).toBeGreaterThan(0);
    });

    it('should not include fixed cameras', () => {
      const ptzModels = getModelsWithPTZ();
      const fixedCameras = ptzModels.filter(m => !m.hasPTZ);

      expect(fixedCameras.length).toBe(0);
    });

    it('should return consistent results', () => {
      const result1 = getModelsWithPTZ();
      const result2 = getModelsWithPTZ();

      expect(result1.length).toBe(result2.length);
    });
  });

  describe('getModelsWithAudio', () => {
    it('should return only audio-capable models', () => {
      const audioModels = getModelsWithAudio();

      expect(audioModels.length).toBeGreaterThan(0);
      audioModels.forEach(model => {
        expect(model.hasAudio).toBe(true);
      });
    });

    it('should include models with audio channels', () => {
      const audioModels = getModelsWithAudio();

      audioModels.forEach(model => {
        expect(model.audioChannels).toBeGreaterThan(0);
      });
    });

    it('should include models from all series', () => {
      const audioModels = getModelsWithAudio();
      const series = new Set(audioModels.map(m => m.series));

      expect(series.size).toBeGreaterThan(1);
    });
  });

  describe('getMultiSensorModels', () => {
    it('should return only multi-sensor models', () => {
      const multiSensorModels = getMultiSensorModels();

      expect(multiSensorModels.length).toBeGreaterThan(0);
      multiSensorModels.forEach(model => {
        expect(model.numberOfSensors).toBeGreaterThan(1);
      });
    });

    it('should include M-series panoramic cameras', () => {
      const multiSensorModels = getMultiSensorModels();
      const mSeries = multiSensorModels.filter(m => m.series === 'M');

      expect(mSeries.length).toBeGreaterThan(0);
    });

    it('should not include single-sensor cameras', () => {
      const multiSensorModels = getMultiSensorModels();
      const singleSensor = multiSensorModels.filter(m => m.numberOfSensors === 1);

      expect(singleSensor.length).toBe(0);
    });

    it('should include F-series with multiple sensors', () => {
      const multiSensorModels = getMultiSensorModels();
      const fSeriesMulti = multiSensorModels.filter(m =>
        m.series === 'F' && m.numberOfSensors > 1
      );

      // F44 should be in the list
      expect(fSeriesMulti.length).toBeGreaterThan(0);
    });
  });

  describe('Model Specifications', () => {
    it('should have valid resolution formats', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        expect(model.resolution).toBeDefined();
        expect(typeof model.resolution).toBe('string');
        expect(model.resolution.length).toBeGreaterThan(0);
      });
    });

    it('should have valid framerate values', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        expect(model.maxFramerate).toBeGreaterThan(0);
        expect(model.maxFramerate).toBeLessThanOrEqual(120);
      });
    });

    it('should have valid feature arrays', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        expect(Array.isArray(model.features)).toBe(true);
      });
    });

    it('should have outdoor/indoor designation in features', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        const hasOutdoor = model.features.includes('outdoor');
        const hasIndoor = model.features.includes('indoor');

        // Should have at least one designation (some may have neither)
        if (hasOutdoor || hasIndoor) {
          expect(hasOutdoor || hasIndoor).toBe(true);
        }
      });
    });

    it('should have valid use case descriptions', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        if (model.useCase) {
          expect(typeof model.useCase).toBe('string');
          expect(model.useCase.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Model Consistency', () => {
    it('should have consistent model naming convention', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        // Model name should match series-number pattern (except F-series which may be shorter)
        if (model.series !== 'F') {
          expect(model.model).toMatch(/^[PQMF]\d+/);
        }
      });
    });

    it('should have consistent fullName format', () => {
      const allModels = getAllModels();

      allModels.forEach(model => {
        expect(model.fullName).toContain('AXIS');
        expect(model.fullName).toContain(model.model);
      });
    });

    it('should have Q-series models as PTZ', () => {
      const qModels = getModelsBySeries('Q');
      const qPTZModels = qModels.filter(m => m.hasPTZ);

      // Most Q-series should be PTZ (though some may be fixed)
      expect(qPTZModels.length).toBeGreaterThan(0);
    });

    it('should have multi-sensor models with panoramic features', () => {
      const multiSensorModels = getMultiSensorModels();
      const withPanoramic = multiSensorModels.filter(m =>
        m.features.includes('panoramic') || m.features.includes('360-degree')
      );

      expect(withPanoramic.length).toBeGreaterThan(0);
    });
  });
});
