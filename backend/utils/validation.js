import Joi from 'joi';

export const validateBody = (schema, options = {}) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
    ...options
  });
  if (error) {
    const message = error.details.map(detail => detail.message).join('; ');
    return res.status(400).json({ success: false, error: message });
  }
  req.body = value;
  return next();
};

export const JoiHelpers = { Joi };
