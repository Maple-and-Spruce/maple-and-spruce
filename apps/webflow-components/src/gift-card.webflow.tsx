/**
 * Webflow Code Component: Gift Card (#300)
 *
 * Wraps the GiftCardWidget for use in the Webflow Designer. Put it on the
 * gift card page. The amounts come from Admin > Settings and the class types
 * from Admin > Class Categories (#309). A link with `?giftClass=<classId>`
 * (or the Class ID prop) preselects that class's type. The heading, intro and
 * fine print are props, so they are in the server-rendered page HTML. See
 * docs/guides/gift-cards.md.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import {
  GIFT_CARD_DEFAULT_FINE_PRINT,
  GIFT_CARD_DEFAULT_HEADING,
  GIFT_CARD_DEFAULT_INTRO,
  GiftCardWidget,
} from './GiftCardWidget';

export default declareComponent(GiftCardWidget, {
  name: 'Gift Card',
  description:
    'Buy a Maple & Spruce gift card: a dollar amount or a class gift certificate, emailed to the recipient or to the buyer to print. Amounts and class types are set in the admin. Pays with Square.',
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
    classId: props.Text({
      name: 'Class ID (optional)',
      defaultValue: '',
    }),
    heading: props.Text({
      name: 'Heading',
      defaultValue: GIFT_CARD_DEFAULT_HEADING,
    }),
    intro: props.Text({
      name: 'Intro',
      defaultValue: GIFT_CARD_DEFAULT_INTRO,
    }),
    finePrint: props.Text({
      name: 'Fine print',
      defaultValue: GIFT_CARD_DEFAULT_FINE_PRINT,
    }),
  },
});
