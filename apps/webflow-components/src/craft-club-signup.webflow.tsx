/**
 * Webflow Code Component: Craft Club Signup
 *
 * Wraps the CraftClubSignupWidget for use in the Webflow Designer.
 * Place this on a private/linked page (or behind a QR code); the approval gate
 * is enforced server-side regardless of where the component is embedded.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { CraftClubSignupWidget } from './CraftClubSignupWidget';

export default declareComponent(CraftClubSignupWidget, {
  name: 'Craft Club Signup',
  description:
    'Approved-only Craft Club membership signup with Square recurring payment. Enter email → eligibility → subscribe ($30/mo) or request access.',
  decorators: [emotionShadowDomDecorator],
  props: {
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
    manageUrl: props.Text({
      name: 'Manage Membership URL',
      defaultValue: 'https://mapleandsprucefolkarts.com/craft-club-manage',
    }),
  },
});
