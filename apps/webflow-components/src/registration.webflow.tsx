/**
 * Webflow Code Component: Class Registration
 *
 * Wraps the RegistrationWidget for use in the Webflow Designer.
 * Props are configurable in the Designer UI.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { RegistrationWidget } from './RegistrationWidget';

export default declareComponent(RegistrationWidget, {
  name: 'Class Registration',
  description:
    'Registration and payment form for a Maple & Spruce class. Includes customer info, Square payment, discount codes, and confirmation.',
  decorators: [emotionShadowDomDecorator],
  props: {
    classId: props.Text({
      name: 'Class ID',
      defaultValue: '',
    }),
    squareAppId: props.Text({
      name: 'Square App ID',
      defaultValue: '',
    }),
    squareLocationId: props.Text({
      name: 'Square Location ID',
      defaultValue: '',
    }),
    env: props.Variant({
      name: 'Environment',
      options: ['dev', 'prod'],
      defaultValue: 'prod',
    }),
    applePayCheckoutUrl: props.Text({
      name: 'Apple Pay Checkout URL',
      defaultValue: 'https://business.mapleandsprucefolkarts.com/apple-pay-checkout',
    }),
    showDigitalWallets: props.Variant({
      name: 'Digital Wallets',
      options: ['show', 'hide'],
      defaultValue: 'hide',
    }),
  },
});
